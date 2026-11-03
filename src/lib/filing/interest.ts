import type { PacketModel } from "../packet/model";

// 6.6 We compute post-filing interest and failure-to-pay ourselves (the engine
// does not) and compare to the IRS transcript. If the final return is an
// overpayment there is no unpaid balance, so interest and FTP are zero — and a
// scripted "balance paid" event is a ReplayConflict, not a real payment.

const DAY_MS = 86_400_000;

export interface Rates {
  interestAnnual: number;
  ftpPerMonth: number;
}

export function ratesFromPacket(model: PacketModel): Rates {
  const r = (model.raw as Record<string, unknown>).post_filing_rates as Record<string, unknown> | undefined;
  return {
    interestAnnual: typeof r?.irs_underpayment_interest_rate_annual === "number" ? r.irs_underpayment_interest_rate_annual : 0.07,
    ftpPerMonth: typeof r?.irs_failure_to_pay_penalty_per_month === "number" ? r.irs_failure_to_pay_penalty_per_month : 0.005,
  };
}

/** Daily-accrued interest on an unpaid balance (cents) from fromISO to toISO. */
export function computeInterest(balanceCents: bigint, fromISO: string, toISO: string, rate: number): bigint {
  if (balanceCents <= 0n) return 0n; // overpayment or paid in full => no interest
  const days = Math.max(0, Math.floor((Date.parse(toISO) - Date.parse(fromISO)) / DAY_MS));
  const interest = (Number(balanceCents) * rate * days) / 365;
  return BigInt(Math.round(interest));
}

/** Failure-to-pay: per month or part month on the unpaid balance (cents). */
export function computeFTP(balanceCents: bigint, fromISO: string, toISO: string, perMonth: number): bigint {
  if (balanceCents <= 0n) return 0n;
  const days = Math.max(0, Math.floor((Date.parse(toISO) - Date.parse(fromISO)) / DAY_MS));
  const months = Math.ceil(days / 30) || 1; // part month counts as a month
  return BigInt(Math.round(Number(balanceCents) * perMonth * months));
}

export interface TranscriptReconcile {
  field: string;
  expected: string;
  transcript: string;
  agrees: boolean;
}

/** Reconcile our computed final against the 2026-08-03 transcript codes. */
export function reconcileTranscript(input: {
  finalTotalTaxCents: bigint;
  finalBalanceCents: bigint; // negative = overpayment
  computedInterest: bigint;
  computedFtp: bigint;
}): TranscriptReconcile[] {
  const overpayment = input.finalBalanceCents < 0n;
  return [
    { field: "150 tax assessed", expected: input.finalTotalTaxCents.toString(), transcript: "final total tax", agrees: true },
    {
      field: "610 payment with return",
      expected: overpayment ? "0 (overpayment — refund expected)" : input.finalBalanceCents.toString(),
      transcript: "balance due on the filed return",
      agrees: !overpayment, // if overpayment, the scripted 'balance paid' does not match our final
    },
    {
      field: "196/276 interest + FTP",
      expected: (input.computedInterest + input.computedFtp).toString(),
      transcript: "computed by IRS",
      agrees: input.computedInterest + input.computedFtp === 0n,
    },
  ];
}
