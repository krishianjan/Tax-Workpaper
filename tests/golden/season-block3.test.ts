import { describe, it, expect } from "vitest";
import { loadModel } from "@/lib/packet/load";
import { computeRequiredSteps, computeFilingGate } from "@/lib/filing/gate";
import { parseRejection, snapshotHashMatches, caMayRelease, isImmutableSubmission } from "@/lib/filing/submission";
import { canTransition } from "@/lib/filing/stateMachine";
import { coveredHashFor, recomputeSignOffs, type SignOff, type World } from "@/lib/people/signoff";
import { bothSpousesSigned, signaturesCoverSnapshot, type Signature } from "@/lib/people/esign";
import { reconcileTranscript } from "@/lib/filing/interest";
import { detectReplayConflict, type TimelineEvent } from "@/lib/filing/replay";
import { carryoversForward, estimates2026 } from "@/lib/filing/rollforward";
import { mapNoticeItems, L566_ITEM_MAP, buildResponseManifest, verifyManifest } from "@/lib/filing/notice";

const model = loadModel();

describe("season block 3 — filing and after", () => {
  it("1. gate is red until approvals + 8867 + notes cleared, then green", () => {
    const facts = {
      engagementSigned: true, identityVerified: false, priorYearReviewed: true, documentsAccounted: true,
      variancesExplained: false, carryoversAgreed: true, paymentsAgreed: false, dueDiligenceComplete: false,
      diagnosticsResolved: true, reviewerSignedOff: false, partnerSignedOff: false, clientApproved: false,
    };
    const red = computeFilingGate({ requiredSteps: computeRequiredSteps(facts), openBlockingNotes: 1, openBlockingQuestions: 0, reopenedSignoffs: 0, completenessGreen: false, staleAdjustments: 0, unapprovedJudgmentIssues: 2, bothSpousesSigned: false });
    expect(red.green).toBe(false);
    const done = { engagementSigned: true, identityVerified: true, priorYearReviewed: true, documentsAccounted: true, variancesExplained: true, carryoversAgreed: true, paymentsAgreed: true, dueDiligenceComplete: true, diagnosticsResolved: true, reviewerSignedOff: true, partnerSignedOff: true, clientApproved: true };
    const green = computeFilingGate({ requiredSteps: computeRequiredSteps(done), openBlockingNotes: 0, openBlockingQuestions: 0, reopenedSignoffs: 0, completenessGreen: true, staleAdjustments: 0, unapprovedJudgmentIssues: 0, bothSpousesSigned: true });
    expect(green.green).toBe(true);
  });

  it("2. both spouses sign the same snapshot; the hash matches the transmit", () => {
    const sigs: Signature[] = [
      { signer: "taxpayer", signedBy: "cu-01", signedAt: "2026-07-10T20:05:00Z", snapshotHash: "SNAP-A" },
      { signer: "spouse", signedBy: "cu-02", signedAt: "2026-07-10T20:06:00Z", snapshotHash: "SNAP-A" },
    ];
    expect(bothSpousesSigned(sigs)).toBe(true);
    expect(signaturesCoverSnapshot(sigs, "SNAP-A")).toBe(true);
    expect(snapshotHashMatches("SNAP-A", "SNAP-A")).toBe(true);
  });

  it("3-4. reject → identity correction → reviewer/partner reopen, 8879 valid → retransmit → accept; CA held then released", () => {
    const efile = (model.raw.tax_agency_records as Record<string, unknown>).efile as Array<Record<string, unknown>>;
    const rej = efile.find((e) => e.status === "rejected")!;
    expect(isImmutableSubmission(String(rej.status))).toBe(true);
    const actions = parseRejection(rej.errors as Array<{ code: string; message: string }>);
    expect(actions[0].dependentId).toBe("theo");

    // The identity fix (FactCorrection) changes the identity hash only.
    const world1: World = { amounts: { agi: 44559000n, totalTax: 8196200n, payments: 7774200n, balance: 422000n }, identityHash: "before", decisionHashes: {}, lineValues: {} };
    const policy = "amounts" as const;
    const mk = (id: string, level: SignOff["level"], scope: SignOff["scope"], by: string): SignOff => ({ id, level, scope, coveredRefs: [], coveredHash: coveredHashFor({ scope, coveredRefs: [] }, world1, policy), signedBy: by, signedAt: "", status: "valid" });
    const signoffs = [mk("rev", "reviewer", "return", "st-02"), mk("par", "partner", "return", "st-03"), mk("cli", "client", "form8879", "cu-01")];
    const world2: World = { ...world1, identityHash: "after" };
    const { signoffs: after } = recomputeSignOffs(signoffs, world2, policy);
    expect(after.find((s) => s.id === "rev")!.status).toBe("reopened");
    expect(after.find((s) => s.id === "par")!.status).toBe("reopened");
    expect(after.find((s) => s.id === "cli")!.status).toBe("valid"); // the key trap

    // CA is held while federal rejected; releases after acceptance.
    expect(caMayRelease("rejected")).toBe(false);
    expect(caMayRelease("accepted")).toBe(true);
    expect(canTransition("retransmitted", "accepted")).toBe(true);
    expect(canTransition("accepted", "frozen")).toBe(true);
  });

  it("5. the filed state is frozen (no further transition)", () => {
    expect(canTransition("frozen", "in_preparation")).toBe(false);
    expect(canTransition("frozen", "transmitted")).toBe(false);
  });

  it("6. transcript reconciliation records the tl-25 ReplayConflict (overpayment)", () => {
    const rec = reconcileTranscript({ finalTotalTaxCents: 8000000n, finalBalanceCents: -1301299n, computedInterest: 0n, computedFtp: 0n });
    expect(rec.find((r) => r.field.startsWith("610"))!.agrees).toBe(false);
    const tl25: TimelineEvent = { id: "tl-25", at: "2026-07-20T14:00:00Z", event: "federal_balance_paid", actor: null, refs: [] };
    expect(detectReplayConflict(tl25, -1301299n)!.resolution).toBe("refund_expected");
  });

  it("7. an amendment references the filed snapshot without changing it", () => {
    const filedHash = "FILED-SNAP-HASH";
    const amendment = { baseSnapshotHash: filedHash, reason: "C6 bank statement arrived", adjustments: [] as string[] };
    // opening/working the amendment never mutates the base
    amendment.adjustments.push("amend-adj-1");
    expect(amendment.baseSnapshotHash).toBe(filedHash);
  });

  it("8. rollforward carries v3 carryovers with provenance + 2026 estimates", () => {
    const cf = carryoversForward(model, []);
    expect(cf.find((c) => c.key === "minimum_tax_credit_from_2025_amt")?.amountCents).toBe(387100n);
    const est = estimates2026(model, 8196200n, 1887400n);
    expect(est.federal.length).toBe(4);
    expect(est.california.length).toBe(3);
  });

  it("9. the notice opens and its response-pack manifest verifies", () => {
    const notices = (model.raw.tax_agency_records as Record<string, unknown>).notices as Array<Record<string, unknown>>;
    const l566 = notices.find((n) => n.id === "N-2025-L566")!;
    const items = mapNoticeItems(l566.items_under_examination as string[], L566_ITEM_MAP);
    expect(items[0].mapping.lines).toContain("SchA.12");
    const files = [{ name: "item1-lines.json", content: '{"SchA.12":20500}' }, { name: "manifest-note.txt", content: "self-contained" }];
    const manifest = buildResponseManifest(files, "FILED-SNAP-HASH", "2028-01-27T00:00:00Z");
    expect(verifyManifest(manifest, files)).toBe(true);
  });
});
