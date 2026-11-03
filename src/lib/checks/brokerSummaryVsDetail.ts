import type { Check, CheckResult } from "./types";
import { makeFinding } from "./types";
import { toCents, formatCents } from "../money";
import { sumCents } from "./helpers";

// Summary proceeds printed on a broker document vs the sum of the extracted lot
// proceeds. The gap is explained by PARTIAL_EXTRACTION (unread pages). D31:
// summary 71,965.00 vs detail 71,715.00, gap 250.00 = the M18 lot on page 32.

export const brokerSummaryVsDetail: Check = {
  id: "BROKER_SUMMARY_VS_DETAIL",
  title: "Broker 1099 summary proceeds vs extracted lot detail",
  area: "Capital gains & 8949",
  secondSource: "page_text",
  run({ model }): CheckResult[] {
    const out: CheckResult[] = [];
    for (const doc of model.documents) {
      const evs = model.evsByDoc.get(doc.id) ?? [];
      const summaryEv = evs.find((e) => e.value_type === "money" && /summary.*proceeds|proceeds.*summary/i.test(e.field));
      if (!summaryEv) continue;
      const detailEvs = evs.filter(
        (e) => e.value_type === "money" && /_proceeds$/i.test(e.field) && !/summary/i.test(e.field),
      );
      if (detailEvs.length === 0) continue;

      const summary = toCents(summaryEv.value) ?? 0n;
      const detail = sumCents(detailEvs.map((e) => toCents(e.value)));
      const gap = summary - detail;
      if (gap === 0n) continue;

      const partialPages = doc.extraction.status === "partial";
      out.push(
        makeFinding({
          checkId: this.id,
          title: `${doc.id}: 1099 summary proceeds differ from the sum of extracted lots`,
          area: this.area,
          secondSource: this.secondSource,
          status: "warn",
          expected: formatCents(summary),
          actual: formatCents(detail),
          delta: gap,
          refs: [doc.id, summaryEv.id],
          primaryRefs: [summaryEv.id],
          explanation:
            `Summary ${formatCents(summary)} − extracted detail ${formatCents(detail)} = gap ${formatCents(gap)}.` +
            (partialPages
              ? ` This document is partially extracted; the gap is explained by its unread page(s) (see PARTIAL_EXTRACTION).`
              : ""),
        }),
      );
    }
    return out;
  },
};
