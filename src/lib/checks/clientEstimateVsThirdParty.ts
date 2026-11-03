import type { Check, CheckResult } from "./types";
import { makeFinding } from "./types";
import { linesOf, line, lineValueCents } from "./helpers";
import { toCents, formatCents } from "../money";
import { taxEffects } from "../effects";

// The engine used a client answer where a third-party document exists. A
// questionnaire answer never outranks a document. Noncash vehicle gift:
// F8283.A1.vehicle = 6,000 from qa-39 ("Kelley Blue Book ~6,000"), but the
// 1098-C (D66) box 4c says the charity sold it for 2,900 gross proceeds — the
// deductible amount. SchA.12 (itemized) is overstated by 3,100.

export const clientEstimateVsThirdParty: Check = {
  id: "CLIENT_ESTIMATE_VS_THIRD_PARTY",
  title: "Client estimate used where a third-party document exists",
  area: "Wages & income",
  secondSource: "client_answer",
  run({ model, versionId }): CheckResult[] {
    const out: CheckResult[] = [];

    for (const ln of linesOf(model, versionId)) {
      const qaSource = ln.sources.find((s) => /^qa-\d+$/.test(s));
      if (!qaSource) continue;
      const isVehicle = /vehicle/i.test(ln.key) || /vehicle|car|auto/i.test(ln.label ?? "");
      if (!isVehicle) continue;

      // Find the governing 1098-C (vehicle donation) and its box 4c gross proceeds.
      const doc = model.documents.find((d) => d.document_type === "1098-C");
      const box4c = doc ? (model.evsByDoc.get(doc.id) ?? []).find((e) => /4c|gross_proceeds|proceeds/i.test(e.field)) : undefined;
      if (!doc || !box4c) continue;

      const engine = lineValueCents(ln) ?? 0n;
      const correct = toCents(box4c.value) ?? 0n;
      if (engine === correct) continue;

      const delta = correct - engine; // deduction change (negative = lower deduction)
      // The itemized total line that includes this gift.
      const itemizedTotal = line(model, versionId, "SchA.12");
      const te = taxEffects(delta, "itemized", { model, versionId });
      out.push(
        makeFinding({
          checkId: this.id,
          title: `${ln.key}: client estimate ${formatCents(engine)} vs 1098-C gross proceeds ${formatCents(correct)}`,
          area: "Wages & income",
          secondSource: this.secondSource,
          status: "fail",
          expected: formatCents(correct),
          actual: formatCents(engine),
          delta,
          taxEffectFed: te.taxFed,
          taxEffectCa: te.taxCa,
          rateCategory: "itemized",
          refs: [ln.key, "SchA.12", qaSource, doc.id, box4c.id].filter(Boolean),
          primaryRefs: [`${versionId}:${ln.key}`],
          explanation: `${ln.key} uses the client's estimate (${qaSource}). For a donated vehicle sold by the charity, the deduction is the gross proceeds on Form 1098-C box 4c: ${formatCents(correct)} (${doc.id}). ${itemizedTotal ? "SchA.12 (itemized) is" : "Itemized deductions are"} overstated by ${formatCents(-delta)}.`,
        }),
      );
    }
    return out;
  },
};
