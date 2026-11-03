import { describe, it, expect } from "vitest";
import { loadModel } from "@/lib/packet/load";
import type { Adjustment, ActorRef } from "@/lib/change/types";
import { effective, totalEffects, detectConflicts, returnTotals, activeAdjustments } from "@/lib/change/effective";
import { authorize, requiresPartner, isPaymentOnly } from "@/lib/change/approval";
import { rebaseAdjustment } from "@/lib/change/rebase";
import { evaluateAlternative, combineScenarios } from "@/lib/change/scenario";
import { planBatch, canUndoBatch, BATCH_CAP } from "@/lib/change/batch";
import type { Effects } from "@/lib/effects";

const model = loadModel();

function adj(p: Partial<Adjustment> = {}): Adjustment {
  return {
    id: p.id ?? "A1",
    issueId: p.issueId ?? null,
    baseVersionId: p.baseVersionId ?? "v3",
    targets: p.targets ?? [{ kind: "line", key: "F1040.1a", baseValue: 212400, newValue: 200000 }],
    primaryLineKey: p.primaryLineKey ?? "F1040.1a",
    rateCategory: p.rateCategory ?? "wages",
    caSourceFlag: p.caSourceFlag ?? false,
    baseDeltaCents: p.baseDeltaCents ?? -1240000n,
    effects: p.effects ?? { taxFed: -100000n, taxCa: 0n, payFed: 0n, payCa: 0n },
    method: p.method ?? "rate_estimate",
    reason: p.reason ?? "test reason at least fifteen chars",
    evidenceIds: p.evidenceIds ?? ["ev-0001"],
    preparedBy: p.preparedBy ?? "st-01",
    reviewedBy: p.reviewedBy ?? null,
    approvedBy: p.approvedBy ?? null,
    batchId: p.batchId ?? null,
    supersedesId: p.supersedesId ?? null,
    version: p.version ?? 0,
    status: p.status ?? "approved",
    createdAt: p.createdAt ?? "2026-06-24T00:00:00Z",
    approvedAt: p.approvedAt ?? "2026-06-24T01:00:00Z",
  };
}

describe("effective() modes + count-once", () => {
  it("engine ignores adjustments; final applies approved; preview applies proposed", () => {
    const approved = adj({ id: "A1", status: "approved", targets: [{ kind: "line", key: "F1040.1a", baseValue: 212400, newValue: 200000 }] });
    const proposed = adj({ id: "A2", status: "proposed", targets: [{ kind: "line", key: "F1040.8", baseValue: 0, newValue: 500 }], primaryLineKey: "F1040.8" });
    const all = [approved, proposed];
    expect(effective(model, "v3", "F1040.1a", "engine", all).value).toBe(212400);
    expect(effective(model, "v3", "F1040.1a", "final", all).value).toBe(200000);
    expect(effective(model, "v3", "F1040.8", "final", all).value).not.toBe(500); // proposed not in final
    expect(effective(model, "v3", "F1040.8", "preview", all).value).toBe(500);
  });

  it("tax effect counts once per adjustment, not per line it touches", () => {
    const multi = adj({
      id: "M",
      status: "approved",
      targets: [
        { kind: "line", key: "SchC.9", baseValue: 8260, newValue: 5670 },
        { kind: "line", key: "SchC.44a", baseValue: 11800, newValue: 8100 },
        { kind: "line", key: "SchC.44c", baseValue: 5940, newValue: 9640 },
      ],
      effects: { taxFed: 91945n, taxCa: 8029n, payFed: 0n, payCa: 0n },
    });
    const t = totalEffects([multi], "final");
    expect(t.taxFed).toBe(91945n); // once, despite 3 line targets
  });

  it("supersede excludes the old; conflict when two active target one line", () => {
    const a = adj({ id: "A", status: "approved" });
    const b = adj({ id: "B", status: "approved", supersedesId: "A", approvedAt: "2026-06-25T00:00:00Z", targets: [{ kind: "line", key: "F1040.1a", baseValue: 212400, newValue: 190000 }] });
    expect(activeAdjustments([a, b], "final").map((x) => x.id)).toEqual(["B"]);
    expect(effective(model, "v3", "F1040.1a", "final", [a, b]).value).toBe(190000);
    // two active, no supersede => conflict
    const c = adj({ id: "C", status: "approved", targets: [{ kind: "line", key: "F1040.1a", baseValue: 212400, newValue: 180000 }] });
    const conflicts = detectConflicts([a, c], "final");
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].adjustmentIds).toEqual(["A", "C"]);
  });

  it("returnTotals = base summary + Σ effects (tax − payments on balance)", () => {
    const payFix = adj({ id: "P", status: "approved", effects: { taxFed: 0n, taxCa: 0n, payFed: -100000n, payCa: 0n }, targets: [{ kind: "line", key: "F1040.26", baseValue: 13000, newValue: 12000 }], primaryLineKey: "F1040.26" });
    const base = returnTotals(model, "v3", "engine", []);
    const fin = returnTotals(model, "v3", "final", [payFix]);
    expect(fin.payFed - base.payFed).toBe(-100000n);
    expect(fin.balanceFed - base.balanceFed).toBe(100000n); // less payment => owe more
    expect(fin.taxFed).toBe(base.taxFed); // payment never changes tax
  });
});

describe("approval traps", () => {
  const preparer: ActorRef = { id: "st-01", role: "preparer" };
  const reviewer: ActorRef = { id: "st-02", role: "reviewer" };
  const partner: ActorRef = { id: "st-03", role: "partner" };

  it("preparer cannot approve their own work (self-review)", () => {
    const a = adj({ status: "proposed", preparedBy: "st-01", effects: { taxFed: -5000n, taxCa: 0n, payFed: 0n, payCa: 0n } });
    expect(authorize("approve", a, preparer, model).code).toBe(403);
  });

  it("reviewer approves small; approver ≠ reviewer enforced for large", () => {
    const small = adj({ status: "proposed", preparedBy: "st-01", effects: { taxFed: -50000n, taxCa: 0n, payFed: 0n, payCa: 0n } });
    expect(authorize("approve", small, reviewer, model).ok).toBe(true);
    const large = adj({ status: "reviewed", preparedBy: "st-01", reviewedBy: "st-02", effects: { taxFed: -1329360n, taxCa: 0n, payFed: 0n, payCa: 0n } });
    expect(authorize("approve", large, reviewer, model).code).toBe(403); // reviewer == reviewedBy, and needs partner
    expect(authorize("approve", large, partner, model).ok).toBe(true);
  });

  it("partner threshold triggers on CA even when federal is zero (trap 5)", () => {
    const e: Effects = { taxFed: 0n, taxCa: -244480n, payFed: 0n, payCa: 0n };
    expect(requiresPartner(e, 100000n)).toBe(true);
  });

  it("payment-only needs reviewer; partner if |balance| > threshold", () => {
    const fedPay: Effects = { taxFed: 0n, taxCa: 0n, payFed: -100000n, payCa: 0n };
    expect(isPaymentOnly(fedPay)).toBe(true);
    expect(requiresPartner(fedPay, 100000n)).toBe(false); // exactly 1000, not >
    const caPay: Effects = { taxFed: 0n, taxCa: 0n, payFed: 0n, payCa: -350000n };
    expect(requiresPartner(caPay, 100000n)).toBe(true);
  });

  it("client/admin blocked; frozen returns 409; revert only by approver", () => {
    const a = adj({ status: "proposed", preparedBy: "st-01", effects: { taxFed: -5000n, taxCa: 0n, payFed: 0n, payCa: 0n } });
    expect(authorize("approve", a, { id: "cu-01", role: "client" }, model).code).toBe(403);
    expect(authorize("approve", a, { id: "st-05", role: "firm_administrator" }, model).code).toBe(403);
    expect(authorize("propose", a, reviewer, model, { frozen: true }).code).toBe(409);
    const approved = adj({ status: "approved", approvedBy: "st-03", preparedBy: "st-01", reviewedBy: "st-02" });
    expect(authorize("revert", approved, reviewer, model).code).toBe(403);
    expect(authorize("revert", approved, partner, model).ok).toBe(true);
  });
});

describe("rebase on a new engine version", () => {
  it("F7203.1 v2 8,200 → v3 2,300: absorbed / rebased / stale", () => {
    const stale = adj({ baseVersionId: "v2", primaryLineKey: "F7203.1", targets: [{ kind: "line", key: "F7203.1", baseValue: 8200, newValue: 5000 }] });
    expect(rebaseAdjustment(model, stale, "v3").outcome).toBe("stale");
    const absorbed = adj({ baseVersionId: "v2", primaryLineKey: "F7203.1", targets: [{ kind: "line", key: "F7203.1", baseValue: 8200, newValue: 2300 }] });
    expect(rebaseAdjustment(model, absorbed, "v3").outcome).toBe("absorbed");
    const rebased = adj({ baseVersionId: "v2", primaryLineKey: "F7203.1", targets: [{ kind: "line", key: "F7203.1", baseValue: 2300, newValue: 9999 }] });
    expect(rebaseAdjustment(model, rebased, "v3").outcome).toBe("rebased");
  });
});

describe("scenarios never leak", () => {
  it("equipment_section179 is exact: fed 0, CA −1,050", () => {
    const r = evaluateAlternative(model, "equipment_section179")!;
    expect(r.exact).toBe(true);
    expect(r.fedTaxChange).toBe(0n);
    expect(r.caTaxChange).toBe(-105000n);
  });
  it("combining two alternatives is an estimate with a note", () => {
    const r = combineScenarios(model, ["equipment_section179", "standard_deduction"]);
    expect(r.exact).toBe(false);
    expect(r.note).toMatch(/interaction not modelled/i);
  });
});

describe("bulk + undo", () => {
  it("caps at 500 and splits applicable/blocked", () => {
    const items = Array.from({ length: 501 }, (_, i) => ({ ref: i, ok: i % 2 === 0, reason: "nope" }));
    const plan = planBatch(items);
    expect(plan.overCap).toBe(true);
    expect(plan.applicable.length + plan.blocked.length).toBe(BATCH_CAP);
  });
  it("undo blocked when an item was later approved/superseded/depended/frozen", () => {
    expect(canUndoBatch([{ ref: "x" }]).ok).toBe(true);
    const r = canUndoBatch([{ ref: "a", laterApproved: true }, { ref: "b", frozen: true }]);
    expect(r.ok).toBe(false);
    expect(r.blockers.length).toBe(2);
  });
});
