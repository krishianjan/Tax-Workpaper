import type { PacketModel } from "../packet/model";
import { line } from "../checks/helpers";
import { toCents } from "../money";

// Independent recomputation of REGULAR tax (F1040.16) from
// engine_reference.parameters — a second source that never trusts the engine.
// Ordinary income is taxed at the MFJ brackets; the net capital gain + qualified
// dividends at the 0/15/20 thresholds; unrecaptured §1250 gain at min(25%, the
// marginal ordinary rate); 28%-rate gain at 28%. A residual vs the engine's
// Schedule D Tax Worksheet is REPORTED (tolerance $1), not hidden — see
// TAX_COMPUTATION_RECOMPUTE and docs/DECISIONS (D41).

export type Bracket = [number | null, number]; // [upper bound (null = top), rate]

export function brackets(model: PacketModel, key = "brackets_mfj"): Bracket[] {
  const p = (model.raw.engine_reference as Record<string, unknown>).parameters as Record<string, unknown>;
  return (p?.[key] as Bracket[]) ?? [];
}

function param(model: PacketModel, key: string): number {
  const p = (model.raw.engine_reference as Record<string, unknown>).parameters as Record<string, unknown>;
  return Number(p?.[key] ?? 0);
}

/** Tax on an ordinary amount (whole dollars) across progressive brackets. */
export function taxOnOrdinary(amount: number, b: Bracket[]): number {
  if (amount <= 0) return 0;
  let tax = 0;
  let prevTop = 0;
  for (const [top, rate] of b) {
    const cap = top === null ? amount : Math.min(amount, top);
    if (cap > prevTop) tax += (cap - prevTop) * rate;
    if (top === null || amount <= top) break;
    prevTop = top;
  }
  return tax;
}

/** The marginal ordinary rate that applies at `income`. */
export function marginalRateAt(income: number, b: Bracket[]): number {
  for (const [top, rate] of b) {
    if (top === null || income <= top) return rate;
  }
  return b.length ? b[b.length - 1][1] : 0;
}

export interface ScheduleDTaxInput {
  taxableIncome: number;
  qualifiedDividends: number;
  netCapGain: number; // smaller of Sch D line 15 or 16, ≥ 0
  unrecap1250: number; // Sch D line 19
  gain28: number; // Sch D line 18
}

export interface ScheduleDTaxResult {
  ordinaryIncome: number;
  ordinaryTax: number;
  pref0: number;
  pref15: number;
  pref20: number;
  prefTax: number;
  rate1250: number;
  tax1250: number;
  tax28: number;
  total: number; // regular tax (rounded)
  taxIfAllOrdinary: number;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** The Schedule D Tax Worksheet result (preferential rates + §1250 + 28%). */
export function scheduleDTax(input: ScheduleDTaxInput, b: Bracket[], ltcg0Top: number, ltcg15Top: number): ScheduleDTaxResult {
  const prefTotal = Math.max(0, input.qualifiedDividends) + Math.max(0, input.netCapGain);
  const specialBuckets = Math.min(input.netCapGain, input.unrecap1250 + input.gain28); // §1250 + 28% portion
  const regularPref = prefTotal - specialBuckets; // taxed at 0/15/20

  const ordinaryIncome = Math.max(0, input.taxableIncome - prefTotal);
  const ordinaryTax = taxOnOrdinary(ordinaryIncome, b);

  // 0/15/20 stacked above ordinary income.
  const pref0 = clamp(ltcg0Top - ordinaryIncome, 0, regularPref);
  const start15 = Math.max(ordinaryIncome, ltcg0Top);
  const pref15 = clamp(ltcg15Top - start15, 0, regularPref - pref0);
  const pref20 = Math.max(0, regularPref - pref0 - pref15);
  const prefTax = pref15 * 0.15 + pref20 * 0.2;

  // Unrecaptured §1250 at min(25%, marginal); 28%-rate gain at 28%.
  const rate1250 = Math.min(0.25, marginalRateAt(input.taxableIncome, b));
  const tax1250 = input.unrecap1250 * rate1250;
  const tax28 = input.gain28 * 0.28;

  const pieces = ordinaryTax + prefTax + tax1250 + tax28;
  const taxIfAllOrdinary = taxOnOrdinary(input.taxableIncome, b);
  const total = Math.round(Math.min(pieces, taxIfAllOrdinary));

  return { ordinaryIncome, ordinaryTax, pref0, pref15, pref20, prefTax, rate1250, tax1250, tax28, total, taxIfAllOrdinary };
}

export interface RegularTaxRecompute {
  input: ScheduleDTaxInput;
  result: ScheduleDTaxResult;
  recomputedCents: bigint;
  engineCents: bigint; // F1040.16
  deltaCents: bigint; // recomputed - engine
  tiesWithinDollar: boolean;
}

function dollars(model: PacketModel, versionId: string, key: string): number {
  return Number(line(model, versionId, key)?.value ?? 0);
}

/** Pull the inputs from the engine lines and recompute regular tax. */
export function recomputeRegularTax(model: PacketModel, versionId: string): RegularTaxRecompute {
  const input: ScheduleDTaxInput = {
    taxableIncome: dollars(model, versionId, "F1040.15"),
    qualifiedDividends: dollars(model, versionId, "F1040.3a"),
    netCapGain: Math.max(0, Math.min(dollars(model, versionId, "SchD.15"), dollars(model, versionId, "SchD.16"))),
    unrecap1250: dollars(model, versionId, "SchD.19"),
    gain28: dollars(model, versionId, "SchD.18"),
  };
  const result = scheduleDTax(input, brackets(model), param(model, "ltcg_0_top"), param(model, "ltcg_15_top"));
  const recomputedCents = BigInt(result.total) * 100n;
  const engineCents = toCents(line(model, versionId, "F1040.16")?.value) ?? 0n;
  const deltaCents = recomputedCents - engineCents;
  const abs = deltaCents < 0n ? -deltaCents : deltaCents;
  return { input, result, recomputedCents, engineCents, deltaCents, tiesWithinDollar: abs <= 100n };
}
