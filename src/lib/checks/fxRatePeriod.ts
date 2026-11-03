import type { Check, CheckResult } from "./types";
import { makeFinding } from "./types";
import { linesOf } from "./helpers";
import { toCents } from "../money";
import { taxEffects } from "../effects";
import type { RateCategory } from "../taxEffect";

// Step-0 check. Every foreign-currency line must use the exchange rate for the
// RIGHT period. Income earned across the year is translated at the year's
// average rate; a balance snapshot (F8938 max / year-end, FBAR) at the
// year-end rate.
//
//   SchB.1.6 Sparbanken interest SEK 18,450 was converted at ref:fx.SEK.2024_average
//   (10.56) → 1,747. The 2025 average is 9.86 → 1,871. Δ +124 (fed +43.15, CA +8.56).
//   F8938 lines use 2025_year_end correctly → they must PASS.

const TAX_YEAR = 2025;

/** Lines that are a balance snapshot (value as of a point in time). */
function isBalanceLine(form: string | null | undefined, key: string): boolean {
  return form === "F8938" || /fbar/i.test(key) || /\.(max|ye|year_end)\b/.test(key);
}

/** The rate category to translate a foreign income line's delta. */
function incomeCategory(form: string | null | undefined): RateCategory | null {
  if (form === "SchB") return "interest";
  if (form === "SchC") return "schc_profit";
  return "ordinary_income";
}

interface FxRef {
  currency: string; // "SEK"
  period: string; // "2024_average"
}

/** Parse `ref:fx.SEK.2024_average` → { currency, period }. */
function parseFxRef(ref: string): FxRef | null {
  const m = ref.match(/^ref:fx\.([A-Z]{3})\.(.+)$/);
  return m ? { currency: m[1], period: m[2] } : null;
}

function fxRate(model: PacketModel_fxRates, currency: string, period: string): number | null {
  const table = model[`${currency}_per_USD`];
  if (!table) return null;
  const v = table[period];
  return typeof v === "number" ? v : null;
}

type PacketModel_fxRates = Record<string, Record<string, number> | undefined>;

export const fxRatePeriod: Check = {
  id: "FX_RATE_PERIOD",
  title: "Foreign-currency lines use the right-period exchange rate",
  area: "Wages & income",
  secondSource: "supplemental_statement",
  run({ model, versionId }): CheckResult[] {
    const out: CheckResult[] = [];
    const fxRates = (model.raw as unknown as { fx_rates?: PacketModel_fxRates }).fx_rates ?? {};

    for (const ln of linesOf(model, versionId)) {
      const fxSource = ln.sources.find((s) => s.startsWith("ref:fx."));
      if (!fxSource) continue;
      const parsed = parseFxRef(fxSource);
      if (!parsed) continue;

      const balance = isBalanceLine(ln.form, ln.key);
      const correctPeriod = balance ? `${TAX_YEAR}_year_end` : `${TAX_YEAR}_average`;

      const usedRate = fxRate(fxRates, parsed.currency, parsed.period);
      const correctRate = fxRate(fxRates, parsed.currency, correctPeriod);

      if (parsed.period === correctPeriod) {
        out.push(
          makeFinding({
            checkId: this.id,
            title: `${ln.key} uses the correct ${parsed.currency} ${correctPeriod} rate`,
            area: this.area,
            secondSource: this.secondSource,
            status: "pass",
            expected: correctPeriod,
            actual: parsed.period,
            delta: 0n,
            refs: [ln.key, fxSource],
            primaryRefs: [ln.key],
            explanation: `${ln.key} is a ${balance ? "balance snapshot" : "flow"} translated at ${parsed.currency} ${parsed.period} (${usedRate}), the correct period.`,
          }),
        );
        continue;
      }

      // Wrong period: recompute from the foreign-currency source amount.
      const foreignEv = ln.sources
        .map((s) => model.evById.get(s))
        .find((e) => e && e.value_type === "money");
      const foreign = foreignEv ? toCents(foreignEv.value) : null;
      const engineUsd = toCents(ln.value);
      let delta: bigint | null = null;
      if (foreign !== null && usedRate && correctRate) {
        // Whole-dollar line values: round the recomputation to whole dollars.
        const foreignDollars = Number(foreign) / 100;
        const correctUsd = Math.round(foreignDollars / correctRate); // dollars
        const correctCents = BigInt(correctUsd) * 100n;
        delta = engineUsd !== null ? correctCents - engineUsd : null;
      }

      const category = incomeCategory(ln.form);
      const effects =
        delta !== null && category && !balance
          ? taxEffects(delta, category, { model, versionId })
          : { taxFed: 0n, taxCa: 0n, payFed: 0n, payCa: 0n };

      out.push(
        makeFinding({
          checkId: this.id,
          title: `${ln.key} converted at the wrong-period ${parsed.currency} rate`,
          area: this.area,
          secondSource: this.secondSource,
          status: "fail",
          expected: `${correctPeriod} (${correctRate})`,
          actual: `${parsed.period} (${usedRate})`,
          delta,
          taxEffectFed: effects.taxFed,
          taxEffectCa: effects.taxCa,
          paymentEffectFed: 0n,
          paymentEffectCa: 0n,
          rateCategory: category,
          refs: [ln.key, fxSource, ...(foreignEv ? [foreignEv.id] : [])],
          primaryRefs: [ln.key],
          explanation:
            `${ln.key} is ${balance ? "a balance snapshot" : "income earned across the year"}, so it must use ` +
            `the ${parsed.currency} ${correctPeriod} rate (${correctRate}). The engine used ${parsed.period} ` +
            `(${usedRate}), ${delta !== null ? `overstating/understating the USD amount by ${Number(delta) / 100}` : "an unverified amount"}.`,
        }),
      );
    }
    return out;
  },
};
