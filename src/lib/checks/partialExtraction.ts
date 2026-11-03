import type { Check, CheckResult } from "./types";
import { makeFinding } from "./types";
import { parseMoneyString } from "../money";

// For documents with extraction.status = partial, scan the printed content of
// pages the pipeline did not read for money and lot transactions. D31 page 32
// ('Additional transactions') holds M18 Ironwood REIT: proceeds 250.00, basis
// 310.00, short-term noncovered — missing from Form 8949.

const LOT_SCAN = /proceeds\s+([\d,]+\.\d{2})[;,]?\s*basis\s+([\d,]+\.\d{2})/gi;

export const partialExtraction: Check = {
  id: "PARTIAL_EXTRACTION",
  title: "Unread pages of partially-extracted documents",
  area: "Capital gains & 8949",
  secondSource: "page_text",
  run({ model }): CheckResult[] {
    const out: CheckResult[] = [];
    for (const doc of model.documents) {
      if (doc.extraction.status !== "partial") continue;
      const extractedPages = new Set((model.evsByDoc.get(doc.id) ?? []).map((e) => e.page ?? 1));
      for (const page of doc.pages) {
        if (extractedPages.has(page.page)) continue; // this page was read
        const content = page.printed_content;
        const lots: Array<{ proceeds: string; basis: string }> = [];
        for (const m of content.matchAll(LOT_SCAN)) lots.push({ proceeds: m[1], basis: m[2] });
        if (lots.length === 0 && !/\d/.test(content)) continue;

        out.push(
          makeFinding({
            checkId: this.id,
            title: `${doc.id} page ${page.page}: transactions on an unread page`,
            area: this.area,
            secondSource: this.secondSource,
            status: "fail",
            expected: "included in the return",
            actual: "not extracted / not on Form 8949",
            delta: lots.length ? parseMoneyString(lots[0].proceeds) : null,
            refs: [doc.id, `doc:${doc.id}#page${page.page}`],
            primaryRefs: [`${doc.id}#p${page.page}`],
            explanation:
              `Page ${page.page} was not read by the pipeline. It contains: ${content.replace(/\s+/g, " ").trim().slice(0, 220)}` +
              (lots.length ? ` — ${lots.length} lot(s) with proceeds/basis to add.` : ""),
            suggestedFix: lots,
          }),
        );
      }
    }
    return out;
  },
};
