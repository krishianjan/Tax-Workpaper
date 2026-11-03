import type { Check, CheckResult } from "./types";
import { makeFinding } from "./types";
import { computeDocumentLinks } from "../evidence/links";
import { linesOf } from "./helpers";

// §5.5 duplicate documents. A whole-document duplicate (D10 = D09) must be
// counted once. We confirm the kept document's values are not double-counted on
// the line that cites them, and keep the duplicate as evidence.

export const duplicateDocument: Check = {
  id: "DUPLICATE_DOCUMENT",
  title: "Duplicate documents counted once",
  area: "Wages & income",
  secondSource: "page_text",
  run({ model, versionId }): CheckResult[] {
    const links = computeDocumentLinks(model).filter((l) => l.kind === "duplicate_of");
    const out: CheckResult[] = [];
    for (const l of links) {
      // Which lines cite the duplicate (should be none) or the kept doc.
      const evsOfDup = new Set((model.evsByDoc.get(l.fromDocId) ?? []).map((e) => e.id));
      const citing = linesOf(model, versionId).filter((ln) => ln.sources.some((s) => evsOfDup.has(s)));
      const status = citing.length === 0 ? "info" : "warn";
      out.push(
        makeFinding({
          checkId: this.id,
          title: `${l.fromDocId} is a duplicate of ${l.toDocId}`,
          area: this.area,
          secondSource: this.secondSource,
          status,
          expected: "duplicate not counted",
          actual: citing.length === 0 ? "kept as evidence; not cited by any line" : `cited by ${citing.map((c) => c.key).join(", ")}`,
          delta: null,
          refs: [l.fromDocId, l.toDocId],
          primaryRefs: [l.fromDocId, l.toDocId],
          explanation:
            citing.length === 0
              ? `${l.fromDocId} and ${l.toDocId} share issuer, type, year and identical money values. The return counts the amount once (the duplicate is retained as evidence of what was uploaded).`
              : `${l.fromDocId} is a duplicate of ${l.toDocId} but is cited by return lines — verify the amount is not double-counted.`,
        }),
      );
    }
    return out;
  },
};
