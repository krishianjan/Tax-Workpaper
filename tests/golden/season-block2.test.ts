import { describe, it, expect } from "vitest";
import { loadModel } from "@/lib/packet/load";
import type { Adjustment, ActorRef } from "@/lib/change/types";
import { authorize } from "@/lib/change/approval";
import { returnTotals } from "@/lib/change/effective";
import { planBatch, canUndoBatch } from "@/lib/change/batch";
import { buildFeed } from "@/lib/change/feed";
import { EXPECTED, expectedTotals } from "./effects.expected";

// End-to-end Feature 3 flow against the pure engine (no DB): propose → 403 →
// reviewer/partner approvals under the real rules → final totals to the cent.

const model = loadModel();
const PRIYA: ActorRef = { id: "st-01", role: "preparer" };
const DANIEL: ActorRef = { id: "st-02", role: "reviewer" };
const HELEN: ActorRef = { id: "st-03", role: "partner" };

function mkAdj(row: (typeof EXPECTED)[number]): Adjustment {
  return {
    id: row.issue,
    issueId: row.issue,
    baseVersionId: "v3",
    targets: [{ kind: "line", key: `L.${row.issue}`, baseValue: 0, newValue: 1 }],
    primaryLineKey: `L.${row.issue}`,
    rateCategory: row.category,
    caSourceFlag: row.issue === "rsu_n1_n3",
    baseDeltaCents: BigInt(row.baseDelta * 100),
    effects: { taxFed: row.taxFed, taxCa: row.taxCa, payFed: row.payFed, payCa: row.payCa },
    method: "rate_estimate",
    reason: `Season adjustment for ${row.issue} with evidence`,
    evidenceIds: ["ev-0001"],
    preparedBy: "st-01",
    reviewedBy: null,
    approvedBy: null,
    batchId: null,
    supersedesId: null,
    version: 0,
    status: "proposed",
    createdAt: "2026-06-24T00:00:00Z",
    approvedAt: null,
  };
}

function apply(adj: Adjustment, patch: Partial<Adjustment>): Adjustment {
  return { ...adj, ...patch };
}

describe("season block 2 — change flow", () => {
  const adjustments = EXPECTED.map(mkAdj);

  it("1–2. preparer proposed; preparer cannot approve (403)", () => {
    for (const a of adjustments) {
      expect(authorize("approve", a, PRIYA, model).code).toBe(403);
    }
  });

  it("3. reviewer approves small; partner approves large after review", () => {
    const final: Adjustment[] = [];
    for (const a of adjustments) {
      const r1 = authorize("approve", a, DANIEL, model);
      if (r1.ok) {
        // small (≤ threshold both jurisdictions) — reviewer approves directly
        final.push(apply(a, r1.patch!));
        continue;
      }
      // large: reviewer reviews, partner approves
      const rev = authorize("review", a, DANIEL, model);
      expect(rev.ok, `${a.id} review`).toBe(true);
      const reviewed = apply(a, rev.patch!);
      const app = authorize("approve", reviewed, HELEN, model);
      expect(app.ok, `${a.id} partner approve`).toBe(true);
      final.push(apply(reviewed, app.patch!));
    }

    // Reviewer approves everything under the 1,000 partner threshold (incl. the
    // Block 4 cross-form duplicate and FX rows); partner approves the four large.
    const reviewerApproved = final.filter((a) => a.approvedBy === "st-02").map((a) => a.id).sort();
    const partnerApproved = final.filter((a) => a.approvedBy === "st-03").map((a) => a.id).sort();
    expect(reviewerApproved).toEqual(["fed_estimate", "fx_sek", "interest_dup", "m18", "mileage", "subaru"]);
    expect(partnerApproved).toEqual(["ca_estimate", "k1099", "rsu_n1_n3", "rsu_n4"]);

    // 4. final totals = v3 summary ± the table, to the cent.
    const base = returnTotals(model, "v3", "engine", []);
    const fin = returnTotals(model, "v3", "final", final);
    const exp = expectedTotals();
    expect(fin.taxFed - base.taxFed).toBe(exp.taxFed);
    expect(fin.taxCa - base.taxCa).toBe(exp.taxCa);
    expect(fin.payFed - base.payFed).toBe(exp.payFed);
    expect(fin.payCa - base.payCa).toBe(exp.payCa);
    expect(fin.balanceFed - base.balanceFed).toBe(exp.balanceFed);
    expect(fin.balanceCa - base.balanceCa).toBe(exp.balanceCa);
  });

  it("5. feed since an older cursor shows exactly the newer events, by seq", () => {
    const events = [
      { seq: 1, at: "2026-06-24T00:00:00Z", actorId: "system", type: "packet.imported", entityKind: "x", entityId: "y", payload: {} },
      { seq: 2, at: "2026-06-24T00:00:00Z", actorId: "st-01", type: "adjustment.proposed", entityKind: "adjustment", entityId: "rsu", payload: {} },
      { seq: 3, at: "2026-06-24T00:00:00Z", actorId: "st-03", type: "adjustment.approved", entityKind: "adjustment", entityId: "rsu", payload: {} },
    ];
    const feed = buildFeed(events, 1);
    expect(feed.total).toBe(2);
    expect(feed.groups.find((g) => g.area === "Adjustments")?.items.length).toBe(2);
    expect(feed.latestSeq).toBe(3);
  });

  it("6. bulk-verify 40 then undo is clean (no later approval/supersede/freeze)", () => {
    const items = Array.from({ length: 40 }, (_, i) => ({ ref: `ev-${i}`, ok: true }));
    const plan = planBatch(items);
    expect(plan.applicable.length).toBe(40);
    expect(plan.overCap).toBe(false);
    const undo = canUndoBatch(plan.applicable.map((ref) => ({ ref })));
    expect(undo.ok).toBe(true);
  });
});
