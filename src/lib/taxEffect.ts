import type { PacketModel } from "./packet/model";

// Tax effect is a READ-ONLY preview in this block. We cannot rerun the engine,
// so the effect of a change = Δ (cents) × the matching per-dollar rate in the
// base version's tax_effect_rates (federal and California).
//
// California nuance (readme): for an item fully California-source — a sale made
// while a CA resident, or the Sacramento rental — the CA effect uses the
// `ca_source_income` rate. Otherwise it uses the category's CA rate (which
// already assumes residency-day proration). The CA-source flag is decided from
// the item's date against household.residency.

export type RateCategory =
  | "wages"
  | "interest"
  | "schc_profit"
  | "stcg"
  | "ltcg"
  | "ordinary_income"
  | "adjustment"
  | "salt"
  | "itemized"
  | "ca_source_income";

export interface TaxEffect {
  fed: bigint; // cents
  ca: bigint; // cents
  category: string;
  caSource: boolean;
}

interface RatePair {
  federal_per_dollar: number;
  california_per_dollar: number;
}

function rates(model: PacketModel, versionId: string): Record<string, RatePair> {
  const v = model.versionById.get(versionId);
  return (v?.tax_effect_rates ?? {}) as Record<string, RatePair>;
}

/** Round cents × rate to the nearest cent, preserving sign. */
function applyRate(deltaCents: bigint, perDollar: number): bigint {
  // deltaCents is cents; perDollar is tax per dollar. tax cents = dollars × rate × 100
  // = (deltaCents/100) × rate × 100 = deltaCents × rate.
  const n = Number(deltaCents) * perDollar;
  return BigInt(Math.round(n));
}

/** Is a date inside a California residency window? */
export function isCaSourceByDate(model: PacketModel, dateISO: string | null | undefined): boolean {
  if (!dateISO) return false;
  const t = Date.parse(dateISO);
  if (Number.isNaN(t)) return false;
  const residency = (model.raw.household as Record<string, unknown>).residency;
  if (!Array.isArray(residency)) return false;
  for (const r of residency) {
    const o = r as Record<string, unknown>;
    if (o.state !== "CA") continue;
    const from = Date.parse(String(o.from));
    const to = Date.parse(String(o.to));
    if (t >= from && t <= to) return true;
  }
  return false;
}

export function taxEffect(
  deltaCents: bigint,
  category: RateCategory,
  opts: { model: PacketModel; versionId: string; caSource?: boolean },
): TaxEffect {
  const table = rates(opts.model, opts.versionId);
  const pair = table[category] ?? { federal_per_dollar: 0, california_per_dollar: 0 };
  const fed = applyRate(deltaCents, pair.federal_per_dollar);

  const caSource = opts.caSource === true;
  const caRate = caSource
    ? (table["ca_source_income"]?.california_per_dollar ?? 0)
    : pair.california_per_dollar;
  const ca = applyRate(deltaCents, caRate);

  return { fed, ca, category, caSource };
}

/**
 * Payments and credits change tax/balance 1:1 (readme). A payment line that is
 * too high by X means the balance due is understated by X; correcting it
 * increases tax owed by X. We express this as the effect on tax owed.
 */
export function paymentEffect(deltaCents: bigint): bigint {
  // delta = correct - engine (negative when the engine overstated the payment).
  // Effect on balance due owed = -delta (lower payment => more owed).
  return -deltaCents;
}
