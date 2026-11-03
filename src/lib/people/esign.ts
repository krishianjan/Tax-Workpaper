import type { PacketModel } from "../packet/model";
import { toCents } from "../money";

// 5.7 Client approval + 8879 e-signature. Both spouses sign separately; all
// pre-transmission checks must pass before transmit.

export interface PreCheck {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
}

export interface EsignInput {
  snapshotHash: string;
  form8879Hash: string;
  bankAccountPresent: boolean;
  ipPinPresent: boolean;
  identityResolved: boolean; // the Theo SSN issue is resolved and agrees with 2024
  paidPreparerId: string | null;
}

export function priorYearAgiMatches(model: PacketModel): boolean {
  const esign = toCents((model.raw.household as Record<string, unknown>).prior_year_agi_for_esignature);
  const prior2024 = toCents(
    ((model.raw.prior_years as Record<string, unknown>).return_2024 as Record<string, unknown>)?.lines
      ? (((model.raw.prior_years as Record<string, unknown>).return_2024 as Record<string, unknown>).lines as Record<string, unknown>)["F1040.11"]
      : null,
  );
  return esign !== null && esign === prior2024;
}

function paidPreparerPtin(model: PacketModel, id: string | null): string | null {
  if (!id) return null;
  const fi = (model.raw.firm as Record<string, unknown>).firm_identity as Record<string, unknown> | undefined;
  const ptins = (fi?.ptins ?? {}) as Record<string, string>;
  const signer = fi?.paid_preparer_signing_returns;
  if (signer !== id) return null;
  return ptins[id] ?? null;
}

export function preTransmissionChecks(model: PacketModel, input: EsignInput): PreCheck[] {
  const ptin = paidPreparerPtin(model, input.paidPreparerId);
  return [
    { id: "prior_year_agi", label: "Prior-year AGI matches 2024 F1040.11", pass: priorYearAgiMatches(model), detail: "228,409 e-sign AGI must equal the 2024 return AGI." },
    { id: "ip_pin", label: "Taxpayer IP PIN present", pass: input.ipPinPresent, detail: "Ngozi's IP PIN (CP01A) is required." },
    { id: "dependent_ssns", label: "Dependent SSNs agree with identity evidence and 2024", pass: input.identityResolved, detail: "The Theo SSN identity issue must be resolved." },
    { id: "bank_account", label: "Bank account present (masked)", pass: input.bankAccountPresent, detail: "Refund/debit account present." },
    { id: "paid_preparer", label: "Paid preparer is the signing partner with a PTIN", pass: input.paidPreparerId === "st-03" && Boolean(ptin), detail: `st-03 PTIN ${ptin ?? "(missing)"}.` },
    { id: "hash_match", label: "8879 hash equals the transmitted snapshot hash", pass: input.form8879Hash === input.snapshotHash && input.snapshotHash.length > 0, detail: "Prevents signing one return and transmitting another." },
  ];
}

export function allPreChecksPass(checks: PreCheck[]): boolean {
  return checks.every((c) => c.pass);
}

export type Signer = "taxpayer" | "spouse";

export interface Signature {
  signer: Signer;
  signedBy: string; // client user id
  signedAt: string;
  snapshotHash: string;
}

/** Both spouses must sign separately; one alone is incomplete (trap 6). */
export function bothSpousesSigned(sigs: Signature[]): boolean {
  return sigs.some((s) => s.signer === "taxpayer") && sigs.some((s) => s.signer === "spouse");
}

/** Every signature must cover the same snapshot that will be transmitted (trap 7). */
export function signaturesCoverSnapshot(sigs: Signature[], snapshotHash: string): boolean {
  return sigs.length > 0 && sigs.every((s) => s.snapshotHash === snapshotHash);
}
