import type { Check, CheckResult } from "./types";
import { makeFinding } from "./types";
import { linesOf, lineValueCents, line } from "./helpers";
import { sumCents } from "./helpers";
import { formatDollars } from "../money";

// Arithmetic integrity (patch v1.1 §2): a re-add of the engine's own inputs.
// This does NOT compare to a second source — it only checks the engine's
// internal addition. Many subtotals legitimately subtract (net profit = income −
// expenses), so a naive-sum difference is reported at info level and triaged in
// DECISIONS.md, not treated as a return error.

export const sumRecompute: Check = {
  id: "SUM_RECOMPUTE",
  title: "Arithmetic integrity — recompute summed lines from their inputs",
  area: "Arithmetic integrity",
  secondSource: "engine_internal",
  run({ model, versionId }): CheckResult[] {
    const out: CheckResult[] = [];
    for (const ln of linesOf(model, versionId)) {
      if (ln.inputs.length === 0) continue;
      const inputCents = ln.inputs.map((k) => lineValueCents(line(model, versionId, k)));
      // Skip lines whose inputs aren't all numeric (text/date subtotals).
      if (inputCents.some((c) => c === null)) continue;
      const stated = lineValueCents(ln);
      if (stated === null) continue;
      const naive = sumCents(inputCents);
      if (naive === stated) continue;

      const looksLikeSubtraction = ln.inputs.length >= 2;
      out.push(
        makeFinding({
          checkId: this.id,
          title: `Recompute of ${ln.key} differs from stated value`,
          area: this.area,
          secondSource: this.secondSource,
          status: "info",
          expected: formatDollars(naive),
          actual: formatDollars(stated),
          delta: stated - naive,
          taxEffectFed: null,
          taxEffectCa: null,
          rateCategory: null,
          refs: [ln.key, ...ln.inputs],
          primaryRefs: [`${versionId}:${ln.key}`],
          explanation:
            `Naive sum of inputs = ${formatDollars(naive)}, stated = ${formatDollars(stated)}.` +
            (looksLikeSubtraction
              ? " Likely a subtotal that subtracts (e.g. income − expenses); confirm the sign convention."
              : " Investigate."),
        }),
      );
    }
    return out;
  },
};
