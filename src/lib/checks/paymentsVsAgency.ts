import type { Check, CheckResult } from "./types";
import { makeFinding } from "./types";
import { line, lineValueCents } from "./helpers";
import { toCents, formatCents } from "../money";
import { paymentEffect } from "../taxEffect";

// Each estimated-payment line vs agency records, confirmations and client
// answers — using the DESIGNATED tax year, not the date range.
//   Federal F1040.26 = 13,000 trusts qa-41 ($4,000 "I think"); the IRS
//   transcript shows 3,000 for Q4 → 12,000.
//   CA F540NR.72 = 14,000 includes a 2025-09-15 $3,500 designated 2024 (D68) →
//   10,500.

const RETURN_YEAR = "2025";

function federalAgencyEstimated(model: import("../packet/model").PacketModel): bigint {
  const snaps = (model.raw.tax_agency_records as Record<string, unknown>).irs_account_transcript_2025;
  if (!Array.isArray(snaps)) return 0n;
  const seen = new Set<string>();
  let total = 0n;
  for (const snap of snaps) {
    const txns = (snap as Record<string, unknown>).transactions;
    if (!Array.isArray(txns)) continue;
    for (const t of txns) {
      const o = t as Record<string, unknown>;
      if (!/estimated tax payment/i.test(String(o.description))) continue;
      const key = `${o.date}|${o.amount}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const c = toCents(o.amount);
      if (c !== null) total += c;
    }
  }
  return total;
}

export const paymentsVsAgency: Check = {
  id: "PAYMENTS_VS_AGENCY",
  title: "Estimated payments vs agency transcript and confirmations",
  area: "Payments",
  secondSource: "agency_transcript",
  run({ model, versionId }): CheckResult[] {
    const out: CheckResult[] = [];

    // Federal
    const fedLine = line(model, versionId, "F1040.26");
    if (fedLine) {
      const engine = lineValueCents(fedLine) ?? 0n;
      const agency = federalAgencyEstimated(model);
      if (agency > 0n && agency !== engine) {
        const delta = agency - engine;
        out.push(
          makeFinding({
            checkId: this.id,
            title: "Federal estimated payments exceed the IRS transcript",
            area: this.area,
            secondSource: this.secondSource,
            status: "fail",
            expected: formatCents(agency),
            actual: formatCents(engine),
            delta,
            taxEffectFed: paymentEffect(delta),
            taxEffectCa: 0n,
            rateCategory: "payment",
            refs: ["F1040.26", "qa-41", "agency:/irs_account_transcript_2025"],
            primaryRefs: [`${versionId}:F1040.26`],
            explanation: `Line = ${formatCents(engine)} relies on the client's estimate (qa-41, "$4,000 I think"). The IRS transcript totals ${formatCents(agency)} of estimated payments. An agency record outranks a questionnaire answer: use ${formatCents(agency)}.`,
          }),
        );
      }
    }

    // California — use the designated tax year on each FTB confirmation.
    const caLine = line(model, versionId, "F540NR.72");
    const ftbDoc = model.documents.find((d) => d.document_type === "payment_confirmation" && /FTB|California/i.test(d.title));
    if (caLine && ftbDoc) {
      const engine = lineValueCents(caLine) ?? 0n;
      const evs = model.evsByDoc.get(ftbDoc.id) ?? [];
      const byPay = new Map<string, { amount?: bigint; year?: string; dateEv?: string; amountEv?: string }>();
      for (const e of evs) {
        const m = e.field.match(/^(pay\d+)_(amount|year|date)$/);
        if (!m) continue;
        const rec = byPay.get(m[1]) ?? {};
        if (m[2] === "amount") {
          rec.amount = toCents(e.value) ?? undefined;
          rec.amountEv = e.id;
        } else if (m[2] === "year") rec.year = String(e.value);
        byPay.set(m[1], rec);
      }
      let designated = 0n;
      const refs = ["F540NR.72", ftbDoc.id];
      for (const rec of byPay.values()) {
        if (rec.year === RETURN_YEAR && rec.amount) designated += rec.amount;
        if (rec.year && rec.year !== RETURN_YEAR && rec.amountEv) refs.push(rec.amountEv);
      }
      if (designated > 0n && designated !== engine) {
        const delta = designated - engine;
        out.push(
          makeFinding({
            checkId: this.id,
            title: "California estimated payments include a payment designated to another year",
            area: this.area,
            secondSource: this.secondSource,
            status: "fail",
            expected: formatCents(designated),
            actual: formatCents(engine),
            delta,
            taxEffectFed: 0n,
            taxEffectCa: paymentEffect(delta),
            rateCategory: "payment",
            refs,
            primaryRefs: [`${versionId}:F540NR.72`],
            explanation: `Line = ${formatCents(engine)} sums FTB payments by date range. Counting only payments designated to ${RETURN_YEAR} gives ${formatCents(designated)} — a ${RETURN_YEAR}-dated payment was designated to a prior year.`,
          }),
        );
      }
    }
    return out;
  },
};
