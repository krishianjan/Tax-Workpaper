import type { PacketModel } from "./packet/model";
import type { RateCategory } from "./taxEffect";

// One place for how a change turns into money. A change has FOUR independent
// effects, never conflated:
//   taxFed / taxCa  — change in tax liability (base delta × rate)
//   payFed / payCa  — change in payments/credits (1:1)
// Balance due = tax − payments, so balanceEffect = taxEffect − paymentEffect.
//
// Rounding (trap 18): each effect is rounded to the nearest cent, half AWAY
// from zero, AT the adjustment. Callers sum the already-rounded values.

export interface Effects {
  taxFed: bigint;
  taxCa: bigint;
  payFed: bigint;
  payCa: bigint;
}

export const ZERO_EFFECTS: Effects = { taxFed: 0n, taxCa: 0n, payFed: 0n, payCa: 0n };

/** Round a cents value (as a float) half away from zero. */
export function roundHalfAwayFromZero(n: number): bigint {
  const sign = n < 0 ? -1 : 1;
  return BigInt(sign * Math.round(Math.abs(n)));
}

export function addEffects(a: Effects, b: Effects): Effects {
  return {
    taxFed: a.taxFed + b.taxFed,
    taxCa: a.taxCa + b.taxCa,
    payFed: a.payFed + b.payFed,
    payCa: a.payCa + b.payCa,
  };
}

export function sumEffects(list: Effects[]): Effects {
  return list.reduce(addEffects, ZERO_EFFECTS);
}

/** Balance-due effect per jurisdiction = tax change − payment change. */
export function balanceFed(e: Effects): bigint {
  return e.taxFed - e.payFed;
}
export function balanceCa(e: Effects): bigint {
  return e.taxCa - e.payCa;
}

interface RatePair {
  federal_per_dollar: number;
  california_per_dollar: number;
}

function ratePair(model: PacketModel, versionId: string, category: string): RatePair {
  const v = model.versionById.get(versionId);
  const table = (v?.tax_effect_rates ?? {}) as Record<string, RatePair>;
  return table[category] ?? { federal_per_dollar: 0, california_per_dollar: 0 };
}

/**
 * Tax effect of a change to the taxable base.
 * `baseDeltaCents` is the signed change to the taxable base in `category`
 * (income up => positive; a deduction/expense going UP => negative).
 * CA uses the ca_source_income rate when the item is fully California-source.
 */
export function taxEffects(
  baseDeltaCents: bigint,
  category: RateCategory,
  opts: { model: PacketModel; versionId: string; caSource?: boolean },
): Effects {
  const pair = ratePair(opts.model, opts.versionId, category);
  const caPair = opts.caSource ? ratePair(opts.model, opts.versionId, "ca_source_income") : pair;
  const d = Number(baseDeltaCents);
  return {
    taxFed: roundHalfAwayFromZero(d * pair.federal_per_dollar),
    taxCa: roundHalfAwayFromZero(d * caPair.california_per_dollar),
    payFed: 0n,
    payCa: 0n,
  };
}

/** A payment/credit change: 1:1, no tax effect. Signed (payment up => positive). */
export function paymentEffects(opts: { fedDeltaCents?: bigint; caDeltaCents?: bigint }): Effects {
  return { taxFed: 0n, taxCa: 0n, payFed: opts.fedDeltaCents ?? 0n, payCa: opts.caDeltaCents ?? 0n };
}
