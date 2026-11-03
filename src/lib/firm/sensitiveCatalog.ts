import type { PacketModel } from "../packet/model";
import type { SensitiveKind } from "./sensitive";

// Enumerates the sensitive fields present in the packet, with a STABLE ref and
// the kind. The plaintext is read here only to seed the encrypted store (and
// for the mask token); it is never returned from a page.

export interface SensitiveField {
  ref: string; // "person:theo:ssn"
  kind: SensitiveKind;
  plaintext: string;
  ownerEntity: string; // the person/doc id
}

export function collectSensitiveFields(model: PacketModel): SensitiveField[] {
  const out: SensitiveField[] = [];
  const household = model.raw.household as Record<string, unknown>;
  const people = (household.people ?? []) as Array<Record<string, unknown>>;
  for (const p of people) {
    const id = String(p.id);
    if (p.ssn) out.push({ ref: `person:${id}:ssn`, kind: "ssn", plaintext: String(p.ssn), ownerEntity: id });
    if (p.ip_pin) out.push({ ref: `person:${id}:ip_pin`, kind: "ip_pin", plaintext: String(p.ip_pin), ownerEntity: id });
    if (p.dob) out.push({ ref: `person:${id}:dob`, kind: "dob", plaintext: String(p.dob), ownerEntity: id });
  }

  const bank = household.bank_account_for_refund_or_payment as Record<string, unknown> | undefined;
  if (bank) {
    if (bank.account)
      out.push({ ref: "household:bank:account", kind: "account", plaintext: String(bank.account), ownerEntity: "household" });
    if (bank.routing)
      out.push({ ref: "household:bank:routing", kind: "routing", plaintext: String(bank.routing), ownerEntity: "household" });
  }
  return out;
}
