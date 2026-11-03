import { describe, it, expect } from "vitest";
import { loadModel } from "@/lib/packet/load";
import type { Adjustment } from "@/lib/change/types";
import { computeDependencyHash, needsReopen, adjustmentsToStale, type Decision } from "@/lib/judgment/decision";
import { computeSwings, flaggedSwings, unexplainedFlagged } from "@/lib/judgment/variance";
import { deriveExpectedDocuments } from "@/lib/judgment/expectedDocs";
import { completenessAreas, computeAreaReadiness, computeGate } from "@/lib/judgment/completeness";
import { deriveOutsideFilings, outsideFilingsResolved } from "@/lib/judgment/outsideFilings";

const model = loadModel();

// Golden steps 8–10 for Feature 4, run against the pure engine + real packet.

describe("8. C6: approve → attach evidence → reopen → adjustment stale", () => {
  it("reopens the decision and cascades its adjustment to stale", () => {
    const h1 = computeDependencyHash({
      evidenceIds: ["msg-c6"],
      evidenceContentHashes: { "msg-c6": "hashA" },
      watchedLineValues: { "F8949.H.C6": 5325 },
    });
    const decision: Decision = {
      id: "dc6", issueId: "iss-c6", question: "C6 basis?", facts: "", evidenceIds: ["msg-c6"],
      type: "judgment_call", options: [], selectedOptionId: "B", authority: "Notice 2014-21",
      positionStrength: "reasonable_basis_disclosed_8275", preparedBy: "st-01", reviewedBy: "st-02",
      approvedBy: "st-03", status: "approved", revision: 0, supersedesId: null, dependencyHash: h1,
      watchedLineKeys: ["F8949.H.C6"], weakEvidenceAccepted: true,
    };
    const c6Adj: Adjustment = { id: "ac6", issueId: "iss-c6", status: "approved" } as Adjustment;

    // Attach the bank statement -> evidence set changes -> hash changes.
    const h2 = computeDependencyHash({
      evidenceIds: ["msg-c6", "bank-stmt"],
      evidenceContentHashes: { "msg-c6": "hashA", "bank-stmt": "hashB" },
      watchedLineValues: { "F8949.H.C6": 5325 },
    });
    expect(needsReopen(decision, h2)).toBe(true);
    const stale = adjustmentsToStale(decision.issueId, [c6Adj]);
    expect(stale.map((a) => a.id)).toEqual(["ac6"]);
  });
});

describe("9. swing list shrinks as swings are explained", () => {
  it("the AGI swing drops out of the unexplained list once explained", () => {
    const swings = computeSwings(model, "v3", []);
    const flagged = flaggedSwings(swings);
    expect(flagged.some((s) => s.key2025 === "F1040.11")).toBe(true);
    const before = unexplainedFlagged(swings, new Set());
    const after = unexplainedFlagged(swings, new Set(["F1040.11"]));
    expect(after.length).toBe(before.length - 1);
  });
});

describe("10. completeness gate: red until registers are complete", () => {
  it("is red with unmatched expected docs / unattested areas / 8867 open, then green", () => {
    const expected = deriveExpectedDocuments(model);
    const areas = completenessAreas(model).map((a) =>
      computeAreaReadiness({ area: a, openIssues: 1, pendingDecisions: 0, undisposedDocs: 0, attestedBy: null }),
    );
    const outside = deriveOutsideFilings(model);

    const red = computeGate({
      expectedDocs: expected,
      areas,
      dueDiligenceComplete: false,
      openBlockingIssues: ["identity-theo"],
      outsideFilingsResolved: outsideFilingsResolved(outside),
    });
    expect(red.green).toBe(false);

    const greenAreas = completenessAreas(model).map((a) =>
      computeAreaReadiness({ area: a, openIssues: 0, pendingDecisions: 0, undisposedDocs: 0, attestedBy: "st-01" }),
    );
    const green = computeGate({
      expectedDocs: expected.map((d) => ({ ...d, status: d.status === "expected" ? "explained" : d.status })),
      areas: greenAreas,
      dueDiligenceComplete: true,
      openBlockingIssues: [],
      outsideFilingsResolved: true,
    });
    expect(green.green).toBe(true);
  });
});
