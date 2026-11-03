import { describe, it, expect } from "vitest";
import { loadModel } from "@/lib/packet/load";
import type { ActorRef, Adjustment } from "@/lib/change/types";
import {
  validateDecision,
  authorizeDecision,
  canAdvancePastProposed,
  computeDependencyHash,
  needsReopen,
  adjustmentsToStale,
  type Decision,
} from "@/lib/judgment/decision";
import { computeDDStatus, canSignDueDiligence, type DueDiligenceRecord } from "@/lib/judgment/dueDiligence";
import { computeAreaReadiness, computeGate } from "@/lib/judgment/completeness";
import { deriveExpectedDocuments } from "@/lib/judgment/expectedDocs";
import { computeSwings, flaggedSwings } from "@/lib/judgment/variance";
import { decisionTemplates } from "@/lib/judgment/templates";

const model = loadModel();

function decision(p: Partial<Decision> = {}): Decision {
  return {
    id: "D1", issueId: p.issueId ?? "iss", question: "q?", facts: "f",
    evidenceIds: p.evidenceIds ?? ["D47"],
    type: p.type ?? "judgment_call",
    options: p.options ?? [
      { id: "A", label: "A", consequence: "", taxEffectFed: 0n, taxEffectCa: 0n, method: "rate_estimate" },
      { id: "B", label: "B", consequence: "", taxEffectFed: 0n, taxEffectCa: 0n, method: "rate_estimate" },
    ],
    selectedOptionId: p.selectedOptionId ?? null,
    authority: p.authority ?? "Treas. Reg. §1.263(a)-3",
    positionStrength: p.positionStrength ?? "substantial_authority",
    preparedBy: p.preparedBy ?? "st-01",
    reviewedBy: p.reviewedBy ?? null,
    approvedBy: p.approvedBy ?? null,
    status: p.status ?? "draft",
    revision: p.revision ?? 0,
    supersedesId: null,
    dependencyHash: p.dependencyHash ?? null,
    watchedLineKeys: p.watchedLineKeys ?? ["SchE.14B"],
    weakEvidenceAccepted: p.weakEvidenceAccepted,
    missingEvidenceResolved: p.missingEvidenceResolved,
  };
}

describe("decision validation (trap 11)", () => {
  it("requires authority, evidence and ≥2 options", () => {
    expect(validateDecision(decision({ authority: "" })).ok).toBe(false);
    expect(validateDecision(decision({ evidenceIds: [] })).ok).toBe(false);
    expect(validateDecision(decision({ options: [{ id: "A", label: "A", consequence: "", taxEffectFed: 0n, taxEffectCa: 0n, method: "rate_estimate" }] })).ok).toBe(false);
    expect(validateDecision(decision()).ok).toBe(true);
  });
  it("attestations/explanations don't need two options", () => {
    expect(validateDecision(decision({ type: "completeness_attestation", options: [] })).ok).toBe(true);
  });
});

describe("decision workflow + SoD", () => {
  const reviewer: ActorRef = { id: "st-02", role: "reviewer" };
  const partner: ActorRef = { id: "st-03", role: "partner" };
  it("preparer cannot review/approve own; approver ≠ reviewer", () => {
    const proposed = decision({ status: "proposed", preparedBy: "st-01" });
    expect(authorizeDecision("review", proposed, { id: "st-01", role: "preparer" }).code).toBe(403);
    const reviewed = decision({ status: "reviewed", preparedBy: "st-01", reviewedBy: "st-02", selectedOptionId: "B" });
    expect(authorizeDecision("approve", reviewed, reviewer).code).toBe(403); // reviewer == reviewedBy
    expect(authorizeDecision("approve", reviewed, partner).ok).toBe(true);
  });
  it("approval requires a selected option", () => {
    const reviewed = decision({ status: "reviewed", preparedBy: "st-01", reviewedBy: "st-02", selectedOptionId: null });
    expect(authorizeDecision("approve", reviewed, partner).code).toBe(422);
  });
});

describe("C6 evidence gate", () => {
  it("cannot pass proposed while evidence missing unless weaker evidence accepted", () => {
    const d = decision({ status: "proposed" });
    expect(canAdvancePastProposed(d, true)).toBe(false);
    expect(canAdvancePastProposed(decision({ weakEvidenceAccepted: true }), true)).toBe(true);
    expect(authorizeDecision("review", d, { id: "st-02", role: "reviewer" }, { missingEvidence: true }).code).toBe(422);
  });
});

describe("reopen on evidence change (trap 13) + cascade", () => {
  it("approved decision reopens when dependency hash changes; its adjustments go stale", () => {
    const h1 = computeDependencyHash({ evidenceIds: ["msg-c6"], evidenceContentHashes: { "msg-c6": "aaa" }, watchedLineValues: { "F8949.H.C6": 5325 } });
    const approved = decision({ status: "approved", issueId: "iss-c6", dependencyHash: h1 });
    expect(needsReopen(approved, h1)).toBe(false);
    const h2 = computeDependencyHash({ evidenceIds: ["msg-c6", "bank-stmt"], evidenceContentHashes: { "msg-c6": "aaa", "bank-stmt": "bbb" }, watchedLineValues: { "F8949.H.C6": 5325 } });
    expect(needsReopen(approved, h2)).toBe(true);

    const adjs: Adjustment[] = [
      { id: "a1", issueId: "iss-c6", status: "approved" } as Adjustment,
      { id: "a2", issueId: "other", status: "approved" } as Adjustment,
    ];
    expect(adjustmentsToStale("iss-c6", adjs).map((a) => a.id)).toEqual(["a1"]);
  });
});

describe("due diligence (trap 15)", () => {
  const theoCTC: DueDiligenceRecord = {
    credit: "CTC", personId: "theo",
    items: [{ question: "age", answer: "8", evidenceIds: [], answeredBy: "st-01" }],
    blockedByIssueIds: ["identity-theo"], completedBy: "st-01",
  };
  it("8867 is blocked while the identity issue is open; cannot sign", () => {
    const open = new Set(["identity-theo"]);
    expect(computeDDStatus(theoCTC, open)).toBe("blocked");
    expect(canSignDueDiligence(theoCTC, { id: "st-02", role: "reviewer" }, open).ok).toBe(false);
  });
  it("once the issue is resolved, a reviewer (≠ preparer) can sign", () => {
    const closed = new Set<string>();
    expect(computeDDStatus(theoCTC, closed)).toBe("complete");
    expect(canSignDueDiligence(theoCTC, { id: "st-01", role: "preparer" }, closed).ok).toBe(false); // preparer == completedBy
    expect(canSignDueDiligence(theoCTC, { id: "st-02", role: "reviewer" }, closed).ok).toBe(true);
  });
});

describe("completeness gate (trap 14)", () => {
  it("stays red while an expected doc is unmatched or an area is unattested", () => {
    const areaRed = computeAreaReadiness({ area: "business", openIssues: 1, pendingDecisions: 0, undisposedDocs: 0, attestedBy: null });
    expect(areaRed.computed).toBe("red");
    const gate = computeGate({
      expectedDocs: [{ id: "x", source: "k1_history", description: "K-1", matchedDocumentId: null, status: "expected" }],
      areas: [areaRed],
      dueDiligenceComplete: false,
      openBlockingIssues: ["identity-theo"],
      outsideFilingsResolved: false,
    });
    expect(gate.green).toBe(false);
    expect(gate.blockers.length).toBeGreaterThanOrEqual(3);
  });
  it("green only when everything is complete", () => {
    const areaGreen = computeAreaReadiness({ area: "business", openIssues: 0, pendingDecisions: 0, undisposedDocs: 0, attestedBy: "st-01" });
    const gate = computeGate({ expectedDocs: [], areas: [areaGreen], dueDiligenceComplete: true, openBlockingIssues: [], outsideFilingsResolved: true });
    expect(gate.green).toBe(true);
  });
});

describe("expected documents + variance (real packet)", () => {
  it("derives K-1 expectations and matches Woodworks/Ridgeline", () => {
    const docs = deriveExpectedDocuments(model);
    expect(docs.length).toBeGreaterThan(0);
    expect(docs.some((d) => /woodworks/i.test(d.description))).toBe(true);
  });
  it("flags the AGI swing 228,409 → 445,590", () => {
    const swings = computeSwings(model, "v3", []);
    const agi = swings.find((s) => s.key2025 === "F1040.11");
    expect(agi).toBeTruthy();
    expect(flaggedSwings(swings).some((s) => s.key2025 === "F1040.11")).toBe(true);
  });
  it("offers grounded templates incl. the HVAC improvement exact effect", () => {
    const t = decisionTemplates(model);
    const hvac = t.find((x) => x.key === "hvac")!;
    const imp = hvac.options.find((o) => o.id === "hvac_improvement")!;
    expect(imp.taxEffectFed).toBe(363300n); // what_if exact, cents
  });
});
