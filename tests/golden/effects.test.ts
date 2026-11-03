import { describe, it, expect } from "vitest";
import { loadModel } from "@/lib/packet/load";
import { taxEffects, paymentEffects } from "@/lib/effects";
import { EXPECTED, expectedTotals } from "./effects.expected";
import type { RateCategory } from "@/lib/taxEffect";

const model = loadModel();
const V = "v3";

// Recompute each hand-checked row from v3 rates and assert it matches, proving
// the rate math + round-half-away-from-zero are correct and tax/payments split.
describe("expected effects recompute from v3 rates", () => {
  const cases: Array<{ id: string; cents: number; cat: RateCategory; caSource: boolean }> = [
    { id: "rsu_n1_n3", cents: -3820000, cat: "stcg", caSource: true },
    { id: "rsu_n4", cents: -942000, cat: "ltcg", caSource: false },
    { id: "k1099", cents: -1240000, cat: "schc_profit", caSource: false },
    { id: "mileage", cents: 259000, cat: "schc_profit", caSource: false },
    { id: "m18", cents: -6000, cat: "stcg", caSource: false },
    { id: "subaru", cents: -310000, cat: "itemized", caSource: false },
    { id: "interest_dup", cents: -184000, cat: "interest", caSource: false },
    { id: "fx_sek", cents: 12400, cat: "interest", caSource: false },
  ];

  for (const c of cases) {
    it(c.id, () => {
      const row = EXPECTED.find((r) => r.issue === c.id)!;
      const e = taxEffects(BigInt(c.cents), c.cat, { model, versionId: V, caSource: c.caSource });
      expect(e.taxFed, `${c.id} fed`).toBe(row.taxFed);
      expect(e.taxCa, `${c.id} ca`).toBe(row.taxCa);
    });
  }

  it("payments are 1:1, no tax", () => {
    const fed = paymentEffects({ fedDeltaCents: -100000n });
    expect(fed).toEqual({ taxFed: 0n, taxCa: 0n, payFed: -100000n, payCa: 0n });
    const ca = paymentEffects({ caDeltaCents: -350000n });
    expect(ca.payCa).toBe(-350000n);
  });

  it("totals incl. Block 4 rows: fed tax −18,830.16, CA tax −3,040.83; fed balance −17,830.16, CA balance +459.17", () => {
    const t = expectedTotals();
    expect(t.taxFed).toBe(-1883016n);
    expect(t.taxCa).toBe(-304083n);
    expect(t.payFed).toBe(-100000n);
    expect(t.payCa).toBe(-350000n);
    expect(t.balanceFed).toBe(-1783016n);
    expect(t.balanceCa).toBe(45917n);
  });
});
