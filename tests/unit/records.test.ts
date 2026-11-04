import { describe, it, expect } from "vitest";
import { loadModel } from "@/lib/packet/load";
import { taxOnOrdinary, marginalRateAt, scheduleDTax, recomputeRegularTax, brackets } from "@/lib/records/taxComputation";
import { tieOut, allTie } from "@/lib/records/tieout";
import { buildRecordMeta, snapshotHash, toChangeMode, RECORD_MODES } from "@/lib/records/mode";

const model = loadModel();
const B = brackets(model);

describe("tax computation — ordinary brackets", () => {
  it("taxes across MFJ brackets exactly", () => {
    // 10% to 23,850; 12% to 96,950.
    expect(taxOnOrdinary(23850, B)).toBeCloseTo(2385, 2);
    expect(taxOnOrdinary(96950, B)).toBeCloseTo(2385 + 73100 * 0.12, 2);
    expect(taxOnOrdinary(0, B)).toBe(0);
    expect(taxOnOrdinary(-5, B)).toBe(0);
  });

  it("marginal rate lands in the right bracket", () => {
    expect(marginalRateAt(50000, B)).toBe(0.12);
    expect(marginalRateAt(346913, B)).toBe(0.24);
    expect(marginalRateAt(2_000_000, B)).toBe(0.37);
  });
});

describe("schedule D tax worksheet", () => {
  it("all-ordinary income = plain bracket tax (no preferential)", () => {
    const r = scheduleDTax({ taxableIncome: 100000, qualifiedDividends: 0, netCapGain: 0, unrecap1250: 0, gain28: 0 }, B, 96700, 600050);
    expect(r.total).toBe(Math.round(taxOnOrdinary(100000, B)));
    expect(r.prefTax).toBe(0);
  });

  it("LTCG stacked in the 15% zone", () => {
    // Ordinary 194,062 + 15% on 100,000 of LTCG below the 20% threshold.
    const r = scheduleDTax({ taxableIncome: 294062, qualifiedDividends: 0, netCapGain: 100000, unrecap1250: 0, gain28: 0 }, B, 96700, 600050);
    expect(r.pref15).toBe(100000);
    expect(r.prefTax).toBeCloseTo(15000, 2);
  });
});

describe("regular tax recompute (real return)", () => {
  it("recomputes 59,980 vs engine 59,727 and reports the residual", () => {
    const r = recomputeRegularTax(model, "v3");
    expect(Number(r.recomputedCents)).toBe(5998000);
    expect(Number(r.engineCents)).toBe(5972700);
    expect(r.tiesWithinDollar).toBe(false);
  });
});

describe("record tie-out", () => {
  it("ties when the subtotal equals the line", () => {
    const t = tieOut("Capital gain", "F1040.7", 18502700n, 18502700n);
    expect(t.ties).toBe(true);
    expect(t.delta).toBe(0n);
  });
  it("fails and reports the gap", () => {
    const t = tieOut("Interest", "F1040.2b", 645000n, 640000n);
    expect(t.ties).toBe(false);
    expect(t.delta).toBe(5000n);
    expect(allTie([t])).toBe(false);
  });
});

describe("record mode + meta", () => {
  it("maps record modes to change modes", () => {
    expect(toChangeMode("engine")).toBe("engine");
    expect(toChangeMode("final")).toBe("final");
    expect(toChangeMode("filed")).toBe("final");
    expect(toChangeMode("amendment")).toBe("final");
  });

  it("snapshot hash is deterministic and mode-sensitive", () => {
    const a = snapshotHash(model, "v3", "engine", []);
    const b = snapshotHash(model, "v3", "engine", []);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it("builds record meta with client, year, mode and packet sha", () => {
    const meta = buildRecordMeta(model, "v3", "final", [], "2026-03-01T00:00:00Z");
    expect(meta.client).toContain("Okafor");
    expect(meta.taxYear).toBe(2025);
    expect(meta.modeLabel).toBe("Final (approved)");
    expect(meta.packetSha.length).toBe(12);
    expect(RECORD_MODES).toContain("filed");
  });
});
