import type { PacketModel } from "../packet/model";
import { toCents } from "../money";

// 6.2 Extension. Form 4868 (+ FTB 3519) filed on v2, balance rounded up to the
// next 500. An extension of time to FILE is not an extension to PAY.

export interface ExtensionRecord {
  form: string;
  filedBy: string;
  basisVersion: string;
  estimatedBalanceCents: bigint;
  paidCents: bigint;
  roundingRule: string;
  note: string;
}

export function buildExtension(model: PacketModel): ExtensionRecord | null {
  const ext = (model.raw as Record<string, unknown>).what_if as Record<string, unknown> | undefined;
  const e = ext?.extension as Record<string, unknown> | undefined;
  if (!e) return null;
  const fed = (e.federal ?? {}) as Record<string, unknown>;
  const note = ((model.raw as Record<string, unknown>).post_filing_rates as Record<string, unknown>)?.note;
  return {
    form: "Form 4868 (+ FTB 3519)",
    filedBy: "st-02",
    basisVersion: String(e.based_on_version ?? "v2"),
    estimatedBalanceCents: toCents(fed.estimated_balance) ?? 0n,
    paidCents: toCents(fed.paid_with_form_4868) ?? 0n,
    roundingRule: String(fed.rule ?? "balance due rounded up to the next 500"),
    note: String(note ?? "An extension of time to file is not an extension of time to pay."),
  };
}

export interface ExtensionVsFinal {
  overpayment: boolean;
  refundCents: bigint; // positive when a refund is expected
  interestExposureCents: bigint; // positive only under a balance due
  explanation: string;
}

/**
 * Compare the extension payment to the FINAL balance. `finalBalanceCents` is the
 * return balance BEFORE the extension payment (negative = overpayment on the
 * return itself). Total position = finalBalance − extensionPaid.
 */
export function extensionVsFinal(ext: ExtensionRecord, finalBalanceCents: bigint): ExtensionVsFinal {
  const net = finalBalanceCents - ext.paidCents; // negative => overpaid
  const overpayment = net < 0n;
  return {
    overpayment,
    refundCents: overpayment ? -net : 0n,
    interestExposureCents: overpayment ? 0n : net,
    explanation: overpayment
      ? `The ${(Number(ext.paidCents) / 100).toLocaleString()} extension payment plus the overpaid return created a refund of ${(Number(-net) / 100).toLocaleString()}.`
      : `A balance of ${(Number(net) / 100).toLocaleString()} remains; interest and FTP accrue from the original due date.`,
  };
}
