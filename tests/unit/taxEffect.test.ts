import { describe, it, expect } from "vitest";
import { taxEffect, isCaSourceByDate } from "@/lib/taxEffect";
import { loadModel } from "@/lib/packet/load";

const model = loadModel();

describe("taxEffect (base = v3 rates)", () => {
  it("RSU fix, federal ≈ -15,536", () => {
    // 38,200 stcg + 9,420 ltcg of basis added => gain drops by those amounts.
    const stcg = taxEffect(-3820000n, "stcg", { model, versionId: "v3" }); // cents
    const ltcg = taxEffect(-942000n, "ltcg", { model, versionId: "v3" });
    const fed = stcg.fed + ltcg.fed;
    // -38,200*0.348 + -9,420*0.238 = -13,293.6 - 2,241.96 = -15,535.56
    expect(Number(fed) / 100).toBeCloseTo(-15535.56, 1);
  });

  it("CA: N1/N3 sold while CA resident use ca_source_income (0.064); N4 after move uses ltcg CA (0.034)", () => {
    expect(isCaSourceByDate(model, "2025-02-18")).toBe(true); // N1
    expect(isCaSourceByDate(model, "2025-05-20")).toBe(true); // N3
    expect(isCaSourceByDate(model, "2025-08-12")).toBe(false); // N4 (after 2025-07-15 move)

    const n1 = taxEffect(-1910000n, "stcg", { model, versionId: "v3", caSource: true });
    expect(Number(n1.ca) / 100).toBeCloseTo(-19100 * 0.064, 1);
    const n4 = taxEffect(-942000n, "ltcg", { model, versionId: "v3", caSource: false });
    expect(Number(n4.ca) / 100).toBeCloseTo(-9420 * 0.034, 1);
  });
});
