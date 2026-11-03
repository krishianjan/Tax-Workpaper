import { describe, it, expect } from "vitest";
import { loadModel } from "@/lib/packet/load";
import { canTransition, caMayTransmit } from "@/lib/filing/stateMachine";
import { computeRequiredSteps, computeFilingGate } from "@/lib/filing/gate";
import { parseRejection, snapshotHashMatches, caMayRelease, isImmutableSubmission } from "@/lib/filing/submission";
import { buildExtension, extensionVsFinal } from "@/lib/filing/extension";
import { computeInterest, computeFTP, reconcileTranscript, ratesFromPacket } from "@/lib/filing/interest";
import { detectReplayConflict, replayHash, eventToCommands, type TimelineEvent } from "@/lib/filing/replay";
import { carryoversForward, expectedDocuments2026, estimates2026, derivedEndedIssuers } from "@/lib/filing/rollforward";
import { mapNoticeItems, L566_ITEM_MAP, buildResponseManifest, verifyManifest, destroyAfter, underLegalHold } from "@/lib/filing/notice";

const model = loadModel();

function allSteps(done: boolean) {
  return computeRequiredSteps({
    engagementSigned: done, identityVerified: done, priorYearReviewed: done, documentsAccounted: done,
    variancesExplained: done, carryoversAgreed: done, paymentsAgreed: done, dueDiligenceComplete: done,
    diagnosticsResolved: done, reviewerSignedOff: done, partnerSignedOff: done, clientApproved: done,
  });
}

describe("6.1 state machine + gate", () => {
  it("enforces the filing path; CA waits for federal", () => {
    expect(canTransition("client_signed", "transmitted")).toBe(true);
    expect(canTransition("transmitted", "accepted")).toBe(true);
    expect(canTransition("accepted", "frozen")).toBe(true);
    expect(canTransition("in_preparation", "transmitted")).toBe(false);
    expect(caMayTransmit("rejected")).toBe(false);
    expect(caMayTransmit("accepted")).toBe(true);
  });
  it("gate is red with any blocker and green only when all clear (trap 5)", () => {
    const base = { requiredSteps: allSteps(true), openBlockingNotes: 0, openBlockingQuestions: 0, reopenedSignoffs: 0, completenessGreen: true, staleAdjustments: 0, unapprovedJudgmentIssues: 0, bothSpousesSigned: true };
    expect(computeFilingGate(base).green).toBe(true);
    expect(computeFilingGate({ ...base, openBlockingNotes: 1 }).green).toBe(false);
    expect(computeFilingGate({ ...base, staleAdjustments: 1 }).green).toBe(false);
    expect(computeFilingGate({ ...base, reopenedSignoffs: 1 }).green).toBe(false);
    expect(computeFilingGate({ ...base, requiredSteps: allSteps(false) }).blockers.length).toBe(12);
  });
});

describe("6.3 submission + rejection", () => {
  it("maps R0000-504-02 to the Theo identity correction (caught pre-filing)", () => {
    const efile = (model.raw.tax_agency_records as Record<string, unknown>).irs_account_transcript_2025;
    expect(Array.isArray(efile)).toBe(true);
    const actions = parseRejection([{ code: "R0000-504-02", message: "dependent 2 Theo" }]);
    expect(actions[0].dependentId).toBe("theo");
    expect(actions[0].linkCheck).toBe("IDENTITY_CONSISTENCY");
    expect(actions[0].askClient).toBe(true);
    expect(actions[0].caughtBeforeFiling).toBe(true);
  });
  it("hash must match; CA waits; rejected is immutable (traps 7, 8)", () => {
    expect(snapshotHashMatches("H", "H")).toBe(true);
    expect(snapshotHashMatches("H", "OTHER")).toBe(false);
    expect(caMayRelease("rejected")).toBe(false);
    expect(caMayRelease("accepted")).toBe(true);
    expect(isImmutableSubmission("rejected")).toBe(true);
  });
});

describe("6.2 extension", () => {
  it("reads 35,728 estimate / 36,000 paid; the final overpayment is a refund", () => {
    const ext = buildExtension(model)!;
    expect(ext.estimatedBalanceCents).toBe(3572800n);
    expect(ext.paidCents).toBe(3600000n);
    // final federal return balance after fixes is an overpayment
    const vf = extensionVsFinal(ext, -1301299n);
    expect(vf.overpayment).toBe(true);
    expect(vf.refundCents).toBeGreaterThan(0n);
  });
});

describe("6.6 interest + transcript reconcile (overpayment => zero)", () => {
  it("no interest/FTP on an overpayment; tl-25 payment conflicts with the final", () => {
    const rates = ratesFromPacket(model);
    expect(rates.interestAnnual).toBe(0.07);
    expect(computeInterest(-100n, "2026-04-15", "2026-07-20", rates.interestAnnual)).toBe(0n);
    expect(computeFTP(-100n, "2026-04-15", "2026-07-20", rates.ftpPerMonth)).toBe(0n);
    const rec = reconcileTranscript({ finalTotalTaxCents: 8000000n, finalBalanceCents: -1301299n, computedInterest: 0n, computedFtp: 0n });
    expect(rec.find((r) => r.field.startsWith("610"))!.agrees).toBe(false); // overpayment vs scripted balance paid
  });
});

describe("6.9 replay — ReplayConflict + idempotency (trap 10)", () => {
  const paid: TimelineEvent = { id: "tl-25", at: "2026-07-20T14:00:00Z", event: "federal_balance_paid", actor: null, refs: [] };
  it("records the tl-25 conflict instead of inventing a payment", () => {
    expect(detectReplayConflict(paid, -1301299n)?.resolution).toBe("refund_expected");
    expect(detectReplayConflict(paid, 5000n)).toBeNull(); // real balance due => no conflict
  });
  it("maps events to commands and is idempotent", () => {
    expect(eventToCommands({ id: "x", at: "", event: "client_approved_and_signed_8879", actor: null, refs: [] })).toEqual(["signForm8879:taxpayer", "signForm8879:spouse"]);
    const evs: TimelineEvent[] = [paid, { id: "tl-23", at: "2026-07-14T16:22:00Z", event: "efile_accepted_federal", actor: null, refs: [] }];
    expect(replayHash(evs)).toBe(replayHash([...evs].reverse()));
  });
});

describe("6.8 rollforward (trap 12)", () => {
  it("carries v3 carryovers with provenance incl. the MTC 3,871 and Ridgeline capital account", () => {
    const cf = carryoversForward(model, []);
    expect(cf.find((c) => c.key === "minimum_tax_credit_from_2025_amt")?.amountCents).toBe(387100n);
    expect(cf.find((c) => c.key === "ridgeline_capital_account_end")?.amountCents).toBe(6366000n);
    expect(cf.every((c) => c.provenance.version === "v3")).toBe(true);
  });
  it("excludes ended 2026 sources (Corvane stock plan, sold property, paid-off loan)", () => {
    const ended = derivedEndedIssuers(model);
    expect(ended.size).toBeGreaterThan(0);
    const docs = expectedDocuments2026(model);
    expect(docs.some((d) => d.status === "ended")).toBe(true);
    // a stock-plan issuer must not appear as an 'expected' recurring W-2 issuer
    expect(docs.filter((d) => d.status === "expected").every((d) => !ended.has(d.issuer))).toBe(true);
  });
  it("2026 estimates: federal 110% in 4 equal installments; CA 30/40/30", () => {
    const est = estimates2026(model, 8000000n, 1800000n);
    expect(est.federal.length).toBe(4);
    const total = est.federal.reduce((s, i) => s + i.amountCents, 0n);
    expect(total).toBeLessThanOrEqual(8800000n); // ~110% (integer division)
    expect(est.california.length).toBe(3);
  });
});

describe("6.7 notice response pack (trap 11)", () => {
  it("maps items to lines via a table and builds a verifiable manifest", () => {
    const mapped = mapNoticeItems(["noncash charity", "gross receipts"], L566_ITEM_MAP);
    expect(mapped[0].mapping.lines).toContain("SchA.12");
    expect(mapped[1].mapping.lines).toContain("SchC.1");
    const files = [{ name: "lines.json", content: '{"SchA.12":20500}' }, { name: "D66.html", content: "<p>1098-C</p>" }];
    const manifest = buildResponseManifest(files, "SNAPHASH", "2028-01-27T00:00:00Z");
    expect(manifest.snapshotHash).toBe("SNAPHASH");
    expect(verifyManifest(manifest, files)).toBe(true);
    expect(verifyManifest(manifest, [{ name: "lines.json", content: "tampered" }, files[1]])).toBe(false);
  });
  it("retention 7 years; an open notice holds destruction", () => {
    expect(destroyAfter("2026-07-14T00:00:00Z").slice(0, 4)).toBe("2033");
    expect(underLegalHold(1)).toBe(true);
    expect(underLegalHold(0)).toBe(false);
  });
});
