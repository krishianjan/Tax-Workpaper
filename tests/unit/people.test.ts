import { describe, it, expect } from "vitest";
import { loadModel } from "@/lib/packet/load";
import { can, type Actor, type Action } from "@/lib/people/permissions";
import { coveredHashFor, recomputeSignOffs, type SignOff, type World } from "@/lib/people/signoff";
import { noteTransition, openBlockingNotes, type ReviewNoteT } from "@/lib/people/reviewNotes";
import { questionTransition, openBlockingQuestions, type QuestionT } from "@/lib/people/questions";
import { deadlineStatus } from "@/lib/people/deadlines";
import { shouldEmit, type NotificationT } from "@/lib/people/notifications";
import { preTransmissionChecks, allPreChecksPass, bothSpousesSigned, signaturesCoverSnapshot, priorYearAgiMatches } from "@/lib/people/esign";

const model = loadModel();
const NOW = "2026-07-10T12:00:00Z";

const priya: Actor = { id: "st-01", role: "preparer", clearance: true, activeFrom: "2025-08-01" };
const daniel: Actor = { id: "st-02", role: "reviewer", clearance: true, activeFrom: "2021-01-04" };
const helen: Actor = { id: "st-03", role: "partner", clearance: true, activeFrom: "2018-05-01" };
const marcus: Actor = { id: "st-04", role: "preparer", clearance: false, activeFrom: "2026-03-24" };
const jo: Actor = { id: "st-05", role: "firm_administrator", clearance: true, activeFrom: "2020-02-10" };
const sam: Actor = { id: "st-06", role: "quality_reviewer", clearance: true, activeFrom: "2027-01-04" };
const ngozi: Actor = { id: "cu-01", role: "client", clearance: false, activeFrom: "2025-08-01" };
const ctx = { now: NOW };

describe("5.1 role matrix — every command × role", () => {
  it("preparer creates but cannot approve or sign", () => {
    expect(can(priya, "content.create", { kind: "adjustment" }, ctx).allow).toBe(true);
    expect(can(priya, "content.approve", { kind: "adjustment", preparedBy: "x" }, ctx).allow).toBe(false);
    expect(can(priya, "signoff.reviewer", { kind: "return" }, ctx).allow).toBe(false);
  });
  it("self-review blocked at item level (trap 3)", () => {
    expect(can(daniel, "content.review", { kind: "adjustment", preparedBy: "st-02" }, ctx).allow).toBe(false);
    expect(can(daniel, "content.review", { kind: "adjustment", preparedBy: "st-01" }, ctx).allow).toBe(true);
    expect(can(helen, "content.approve", { kind: "adjustment", preparedBy: "st-01", reviewedBy: "st-03" }, ctx).allow).toBe(false);
  });
  it("partner releases filing; admin cannot approve/sign tax content", () => {
    expect(can(helen, "filing.release", { kind: "return" }, ctx).allow).toBe(true);
    expect(can(jo, "content.approve", { kind: "adjustment", preparedBy: "x" }, ctx).allow).toBe(false);
    expect(can(jo, "signoff.partner", { kind: "return" }, ctx).allow).toBe(false);
    expect(can(jo, "staff.manage", { kind: "staff" }, ctx).allow).toBe(true);
  });
  it("client isolation (trap 13)", () => {
    expect(can(ngozi, "view.internal", { kind: "note" }, ctx).allow).toBe(false);
    expect(can(ngozi, "client.approve", { kind: "return", ownerClientId: "cu-01" }, { ...ctx, ownEngagementClientIds: ["cu-01", "cu-02"] }).allow).toBe(true);
    expect(can(ngozi, "view.engagement", { kind: "doc", ownerClientId: "cu-99" }, { ...ctx, ownEngagementClientIds: ["cu-01"] }).allow).toBe(false);
    expect(can(ngozi, "content.create", { kind: "adjustment" }, ctx).allow).toBe(false);
  });
  it("active_from gate: Sam before 2027-01-04, Marcus before 2026-03-24 (trap 2)", () => {
    expect(can(sam, "reviewnote.create", { kind: "issue" }, { now: "2026-07-10T00:00:00Z" }).allow).toBe(false);
    expect(can(sam, "reviewnote.create", { kind: "issue" }, { now: "2027-02-01T00:00:00Z" }).allow).toBe(true);
    expect(can(marcus, "content.create", { kind: "adjustment" }, { now: "2026-01-01T00:00:00Z" }).allow).toBe(false);
  });
  it("Marcus (no clearance) can never unmask (trap 2)", () => {
    expect(can(marcus, "unmask", { kind: "ssn" }, ctx).allow).toBe(false);
    expect(can(priya, "unmask", { kind: "ssn" }, ctx).allow).toBe(true);
  });
  it("frozen blocks writes; quality may still add a post-filing note", () => {
    expect(can(priya, "content.create", { kind: "adjustment" }, { now: "2027-02-01T00:00:00Z", frozen: true }).allow).toBe(false);
    expect(can(sam, "reviewnote.create", { kind: "issue" }, { now: "2027-02-01T00:00:00Z", frozen: true }).allow).toBe(true);
  });
});

describe("5.4 sign-off reopen by scope (trap 4)", () => {
  const policy = "amounts" as const;
  const world1: World = {
    amounts: { agi: 44559000n, totalTax: 8196200n, payments: 7774200n, balance: 422000n },
    identityHash: "idhash-1",
    decisionHashes: { d1: "dh1" },
    lineValues: {},
  };
  function mk(level: SignOff["level"], scope: SignOff["scope"], signedBy: string): SignOff {
    return { id: `${level}-${scope}`, level, scope, coveredRefs: scope === "decision" ? ["d1"] : [], coveredHash: coveredHashFor({ scope, coveredRefs: scope === "decision" ? ["d1"] : [] }, world1, policy), signedBy, signedAt: NOW, status: "valid" };
  }

  it("identity-only change reopens reviewer/partner return sign-offs but NOT the client 8879", () => {
    const signoffs = [mk("reviewer", "return", "st-02"), mk("partner", "return", "st-03"), mk("client", "form8879", "cu-01")];
    const world2: World = { ...world1, identityHash: "idhash-2" }; // identity changed, amounts same
    const { signoffs: after } = recomputeSignOffs(signoffs, world2, policy);
    expect(after.find((s) => s.id === "reviewer-return")!.status).toBe("reopened");
    expect(after.find((s) => s.id === "partner-return")!.status).toBe("reopened");
    expect(after.find((s) => s.id === "client-form8879")!.status).toBe("valid");
  });

  it("an amounts change reopens the 8879 too", () => {
    const signoffs = [mk("client", "form8879", "cu-01")];
    const world2: World = { ...world1, amounts: { ...world1.amounts, balance: 999n } };
    const { signoffs: after } = recomputeSignOffs(signoffs, world2, policy);
    expect(after[0].status).toBe("reopened");
  });

  it("amounts_and_identity policy DOES reopen the 8879 on identity change", () => {
    const p2 = "amounts_and_identity" as const;
    const so: SignOff = { id: "c", level: "client", scope: "form8879", coveredRefs: [], coveredHash: coveredHashFor({ scope: "form8879", coveredRefs: [] }, world1, p2), signedBy: "cu-01", signedAt: NOW, status: "valid" };
    const world2: World = { ...world1, identityHash: "idhash-2" };
    expect(recomputeSignOffs([so], world2, p2).signoffs[0].status).toBe("reopened");
  });
});

describe("5.3 review notes", () => {
  const note = (p: Partial<ReviewNoteT> = {}): ReviewNoteT => ({ id: "n1", authorId: "st-02", assigneeId: "st-01", targetKind: "issue", targetId: "i1", severity: "blocking", status: "open", ...p });
  it("assignee addresses; only cleared removes the block", () => {
    expect(noteTransition(note(), "address").next).toBe("addressed");
    expect(noteTransition(note({ status: "cleared" }), "clear").ok).toBe(false);
    expect(openBlockingNotes([note(), note({ id: "n2", severity: "non_blocking" }), note({ id: "n3", status: "cleared" })]).map((n) => n.id)).toEqual(["n1"]);
  });
});

describe("5.2 questions", () => {
  const q = (p: Partial<QuestionT> = {}): QuestionT => ({ id: "q1", fromId: "st-01", toId: "cu-01", targetKind: "issue", targetId: "C6", text: "basis?", dueAt: null, status: "open", blocksFiling: true, ...p });
  it("answer → accept flow; blocking until accepted/withdrawn", () => {
    expect(questionTransition(q(), "answer").next).toBe("answered");
    expect(questionTransition(q({ status: "answered" }), "accept").next).toBe("accepted");
    expect(openBlockingQuestions([q(), q({ id: "q2", status: "accepted" })]).map((x) => x.id)).toEqual(["q1"]);
  });
});

describe("5.6 deadlines + notifications", () => {
  it("status is computed from UTC; internal dates show overdue honestly (trap 14)", () => {
    expect(deadlineStatus({ what: "handoff", dateUtc: "2026-03-27T00:00:00Z" }, "2026-07-10T00:00:00Z")).toBe("overdue");
    expect(deadlineStatus({ what: "ext", dateUtc: "2026-10-15T00:00:00Z" }, "2026-10-12T00:00:00Z")).toBe("due_soon");
    expect(deadlineStatus({ what: "met", dateUtc: "2026-03-27T00:00:00Z", metEventSeq: 5 }, "2026-07-10T00:00:00Z")).toBe("met");
  });
  it("notifications dedupe within 10 minutes (trap 15)", () => {
    const recent: NotificationT[] = [{ userId: "st-01", type: "signoff.reopened", entityId: "r1", at: "2026-07-10T12:00:00Z" }];
    expect(shouldEmit({ userId: "st-01", type: "signoff.reopened", entityId: "r1", at: "2026-07-10T12:05:00Z" }, recent)).toBe(false);
    expect(shouldEmit({ userId: "st-01", type: "signoff.reopened", entityId: "r1", at: "2026-07-10T12:20:00Z" }, recent)).toBe(true);
  });
});

describe("5.7 e-sign checks", () => {
  it("prior-year AGI matches 2024 F1040.11", () => {
    expect(priorYearAgiMatches(model)).toBe(true);
  });
  it("all pre-transmission checks pass only when everything is in place", () => {
    const good = preTransmissionChecks(model, { snapshotHash: "H", form8879Hash: "H", bankAccountPresent: true, ipPinPresent: true, identityResolved: true, paidPreparerId: "st-03" });
    expect(allPreChecksPass(good)).toBe(true);
    const badHash = preTransmissionChecks(model, { snapshotHash: "H", form8879Hash: "OTHER", bankAccountPresent: true, ipPinPresent: true, identityResolved: true, paidPreparerId: "st-03" });
    expect(allPreChecksPass(badHash)).toBe(false); // trap 7
    const badPrep = preTransmissionChecks(model, { snapshotHash: "H", form8879Hash: "H", bankAccountPresent: true, ipPinPresent: true, identityResolved: true, paidPreparerId: "st-01" });
    expect(badPrep.find((c) => c.id === "paid_preparer")!.pass).toBe(false);
  });
  it("both spouses must sign the SAME snapshot (trap 6)", () => {
    expect(bothSpousesSigned([{ signer: "taxpayer", signedBy: "cu-01", signedAt: NOW, snapshotHash: "H" }])).toBe(false);
    const both = [
      { signer: "taxpayer" as const, signedBy: "cu-01", signedAt: NOW, snapshotHash: "H" },
      { signer: "spouse" as const, signedBy: "cu-02", signedAt: NOW, snapshotHash: "H" },
    ];
    expect(bothSpousesSigned(both)).toBe(true);
    expect(signaturesCoverSnapshot(both, "H")).toBe(true);
    expect(signaturesCoverSnapshot(both, "OTHER")).toBe(false);
  });
});
