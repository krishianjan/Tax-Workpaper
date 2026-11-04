import type { Check, CheckResult } from "./types";
import { makeFinding } from "./types";
import { recomputeRegularTax } from "../records/taxComputation";

// Feature 8 item 2. An INDEPENDENT recompute of regular tax (F1040.16) from
// engine_reference.parameters, compared with the engine. Tolerance $1. Any
// difference is reported (not auto-applied): it means our second source and the
// engine's Schedule D Tax Worksheet disagree and a human should reconcile.

export const taxComputationRecompute: Check = {
  id: "TAX_COMPUTATION_RECOMPUTE",
  title: "Regular tax recomputed from the bracket parameters",
  area: "Arithmetic integrity",
  secondSource: "engine_internal",
  run({ model, versionId }): CheckResult[] {
    const r = recomputeRegularTax(model, versionId);
    const recomputed = Number(r.recomputedCents) / 100;
    const engine = Number(r.engineCents) / 100;
    const delta = Number(r.deltaCents) / 100;

    return [
      makeFinding({
        checkId: this.id,
        title: r.tiesWithinDollar
          ? `Regular tax ties: recompute ${recomputed.toLocaleString()} ≈ engine ${engine.toLocaleString()}`
          : `Regular tax differs: recompute ${recomputed.toLocaleString()} vs engine ${engine.toLocaleString()} (Δ ${delta.toLocaleString()})`,
        area: this.area,
        secondSource: this.secondSource,
        status: r.tiesWithinDollar ? "pass" : "warn",
        judgment: true, // we don't auto-adjust tax from a worksheet residual
        expected: engine,
        actual: recomputed,
        delta: r.deltaCents,
        taxEffectFed: 0n,
        taxEffectCa: 0n,
        refs: ["F1040.16", "F1040.15", "SchD.15", "SchD.16", "SchD.18", "SchD.19", "F1040.3a"],
        primaryRefs: ["F1040.16"],
        explanation:
          `Independent recompute from brackets_mfj + the 0/15/20 LTCG thresholds, with unrecaptured §1250 at ` +
          `${(r.result.rate1250 * 100).toFixed(0)}% and 28%-rate gain: ordinary ${r.result.ordinaryIncome.toLocaleString()} ` +
          `@ brackets = ${Math.round(r.result.ordinaryTax).toLocaleString()}, preferential = ` +
          `${Math.round(r.result.prefTax).toLocaleString()}, §1250 = ${Math.round(r.result.tax1250).toLocaleString()}. ` +
          (r.tiesWithinDollar
            ? `Within $1 of the engine's Schedule D Tax Worksheet.`
            : `A $${Math.abs(delta).toLocaleString()} residual remains vs the engine's full Schedule D Tax Worksheet — reconcile worksheet lines before filing.`),
      }),
    ];
  },
};
