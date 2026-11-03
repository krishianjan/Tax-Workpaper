import type { Check, CheckResult } from "./types";
import { makeFinding } from "./types";
import { all8949Lots, isShortTermBox } from "./helpers";
import { taxEffect, isCaSourceByDate, type RateCategory } from "../taxEffect";
import { formatCents } from "../money";

// Patch v1.1 §1: every 8949 lot with basis 0 or missing, noncovered, or
// transferred-in. Match against supplemental statements (document_type/title
// "supplemental") on acquired date (+ shares + sold date). The engine's
// R-8949-LOT failed to apply these adjusted bases.
//   Northlake N1/N3/N4 ↔ D11 RSU-2502/2505/2308 = 19,100 / 19,100 / 9,420 (47,620).
//   Coinhaven C6: basis 0, transferred in — unresolved (bank line pending).

interface SuppLot {
  lotId: string;
  acquired: string | null;
  adjustedBasis: bigint | null;
  docId: string;
}

function supplementalLots(model: import("../packet/model").PacketModel): SuppLot[] {
  const out: SuppLot[] = [];
  for (const doc of model.documents) {
    const isSupp = /supplement/i.test(doc.document_type) || /supplement/i.test(doc.title);
    if (!isSupp) continue;
    const byLot = new Map<string, SuppLot>();
    for (const e of model.evsByDoc.get(doc.id) ?? []) {
      const m = e.field.match(/^(.*)_(adjusted_basis|acquired)$/);
      if (!m) continue;
      const lotId = m[1];
      const entry = byLot.get(lotId) ?? { lotId, acquired: null, adjustedBasis: null, docId: doc.id };
      if (m[2] === "adjusted_basis") entry.adjustedBasis = BigInt(Math.round(Number(e.value) * 100));
      else entry.acquired = String(e.value);
      byLot.set(lotId, entry);
    }
    out.push(...byLot.values());
  }
  return out;
}

export const missingOrZeroBasis: Check = {
  id: "MISSING_OR_ZERO_BASIS",
  title: "8949 lots with zero or missing basis vs supplemental statements",
  area: "Capital gains & 8949",
  secondSource: "supplemental_statement",
  run({ model, versionId }): CheckResult[] {
    const out: CheckResult[] = [];
    const supps = supplementalLots(model);

    for (const lot of all8949Lots(model, versionId)) {
      const zeroOrMissing = lot.basis === null || lot.basis === 0n;
      const noncoveredOrTransfer = /noncovered|transfer/i.test(lot.raw);
      if (!zeroOrMissing && !noncoveredOrTransfer) continue;

      const match = lot.acquired ? supps.find((s) => s.acquired === lot.acquired && s.adjustedBasis !== null) : undefined;
      const short = isShortTermBox(lot.box);
      const category: RateCategory = short ? "stcg" : "ltcg";

      if (match && match.adjustedBasis) {
        const delta = -match.adjustedBasis; // adding basis reduces the gain
        const caSource = isCaSourceByDate(model, lot.sold);
        const te = taxEffect(delta, category, { model, versionId, caSource });
        out.push(
          makeFinding({
            checkId: this.id,
            title: `${lot.key}: basis ${lot.basis === null ? "not reported" : "0"} — supplemental basis ${formatCents(match.adjustedBasis)} not applied`,
            area: this.area,
            secondSource: this.secondSource,
            status: "fail",
            expected: `basis ${formatCents(match.adjustedBasis)}`,
            actual: "basis 0",
            delta,
            taxEffectFed: te.fed,
            taxEffectCa: te.ca,
            rateCategory: category,
            refs: [lot.key, match.docId, match.lotId],
            primaryRefs: [`${versionId}:${lot.key}`],
            explanation:
              `Lot acquired ${lot.acquired}, sold ${lot.sold}. ${match.docId} lot ${match.lotId} reports adjusted basis ${formatCents(match.adjustedBasis)} (acquired ${match.acquired}). ` +
              `Gain is overstated by ${formatCents(match.adjustedBasis)} (${short ? "short-term" : "long-term"}${caSource ? ", California-source" : ""}).`,
            suggestedFix: { applyBasis: match.adjustedBasis.toString(), from: match.lotId },
          }),
        );
      } else {
        out.push(
          makeFinding({
            checkId: this.id,
            title: `${lot.key}: basis ${lot.basis === null ? "not reported" : "0"} — no supplemental match`,
            area: /btc|crypto|coin|units/i.test(lot.raw) ? "Digital assets" : this.area,
            secondSource: this.secondSource,
            status: "warn",
            expected: "cost basis",
            actual: "basis 0 / missing",
            delta: null,
            refs: [lot.key],
            primaryRefs: [`${versionId}:${lot.key}`],
            explanation:
              `Lot acquired ${lot.acquired}, sold ${lot.sold}; basis is zero/missing` +
              (/transfer/i.test(lot.raw) ? " (transferred in from an external wallet/account)." : ".") +
              " No supplemental statement matched. Blocked pending client evidence of basis.",
            judgment: true,
          }),
        );
      }
    }
    return out;
  },
};
