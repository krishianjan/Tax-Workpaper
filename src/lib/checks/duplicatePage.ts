import type { Check, CheckResult } from "./types";
import { makeFinding } from "./types";
import { computePageDuplicates } from "../evidence/links";
import { linesOf, line, lineValueCents } from "./helpers";
import { taxEffects } from "../effects";
import { formatDollars, toCents } from "../money";

// Within one document, flag identical pages (after stripping parenthetical
// scanner notes + whitespace) and any line that sums all pages — the duplicate
// page inflates the total. D23 page 3 == page 2; engine miles 11,800 includes
// the duplicated 3,700; unique 8,100. The standard-mileage expense SchC.9 then
// recomputes 8,100 × rate = 5,670 instead of 8,260.

function paramNumber(model: PacketModelLike, name: string): number | null {
  const params = (model.raw.engine_reference as Record<string, unknown>).parameters as Record<string, unknown> | undefined;
  const v = params?.[name];
  return typeof v === "number" ? v : null;
}

type PacketModelLike = import("../packet/model").PacketModel;

export const duplicatePage: Check = {
  id: "DUPLICATE_PAGE",
  title: "Duplicate pages within a document inflate page-summed lines",
  area: "Schedule C",
  secondSource: "page_text",
  run({ model, versionId }): CheckResult[] {
    const out: CheckResult[] = [];
    for (const doc of model.documents) {
      const dupes = computePageDuplicates(doc);
      if (dupes.length === 0) continue;

      for (const d of dupes) {
        out.push(
          makeFinding({
            checkId: this.id,
            title: `${doc.id}: page ${d.pageNo} is a duplicate scan of page ${d.duplicateOfPage}`,
            area: this.area,
            secondSource: this.secondSource,
            status: "warn",
            refs: [doc.id, `doc:${doc.id}#page${d.pageNo}`],
            primaryRefs: [`${doc.id}#p${d.pageNo}`],
            explanation: `Normalized content of page ${d.pageNo} equals page ${d.duplicateOfPage}. Any total that sums every page double-counts page ${d.duplicateOfPage}.`,
          }),
        );

        // Evs on the duplicated page that feed a summing line.
        const dupEvs = (model.evsByDoc.get(doc.id) ?? []).filter((e) => (e.page ?? 1) === d.pageNo);
        for (const e of dupEvs) {
          const summing = linesOf(model, versionId).filter((ln) => ln.sources.includes(e.id));
          for (const L of summing) {
            const engineQty = Number(L.value);
            const dupQty = Number(e.value);
            if (!Number.isFinite(engineQty) || !Number.isFinite(dupQty)) continue;
            const unique = engineQty - dupQty;
            out.push(
              makeFinding({
                checkId: this.id,
                title: `${L.key} sums the duplicated page (${L.label ?? ""})`.trim(),
                area: this.area,
                secondSource: this.secondSource,
                status: "fail",
                expected: unique,
                actual: engineQty,
                delta: null,
                refs: [L.key, e.id, doc.id],
                primaryRefs: [`${versionId}:${L.key}`],
                explanation: `${L.key} = ${engineQty} includes ${dupQty} from duplicated page ${d.pageNo}. Unique = ${unique}.`,
              }),
            );

            // Knock-on: a line that multiplies the summed quantity by a rate param.
            const rate = paramNumber(model, "mileage_rate");
            const knockOns = linesOf(model, versionId).filter(
              (k) => k.inputs.includes(L.key) && k.sources.some((s) => s.startsWith("ref:param")),
            );
            for (const K of knockOns) {
              if (rate === null) continue;
              const engineExp = lineValueCents(K) ?? 0n;
              const correctExp = toCents(unique * rate) ?? 0n;
              const delta = correctExp - engineExp; // line change (expense goes down)
              // Reducing an expense INCREASES taxable profit: base delta = -(line delta).
              const te = taxEffects(-delta, "schc_profit", { model, versionId });
              out.push(
                makeFinding({
                  checkId: this.id,
                  title: `${K.key} recomputed from unique ${L.key}`,
                  area: this.area,
                  secondSource: this.secondSource,
                  status: "fail",
                  expected: formatDollars(correctExp),
                  actual: formatDollars(engineExp),
                  delta,
                  taxEffectFed: te.taxFed,
                  taxEffectCa: te.taxCa,
                  rateCategory: "schc_profit",
                  refs: [K.key, L.key, doc.id],
                  primaryRefs: [`${versionId}:${K.key}`],
                  explanation: `${K.key} = ${formatDollars(engineExp)} uses ${engineQty} × ${rate}. With the unique ${unique} it is ${formatDollars(correctExp)}.`,
                }),
              );
            }
          }
        }
      }
    }
    return out;
  },
};
