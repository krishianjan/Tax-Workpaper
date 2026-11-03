import type { Check, CheckResult } from "./types";
import { makeFinding } from "./types";
import { linesOf } from "./helpers";
import { toCents } from "../money";
import { taxEffects } from "../effects";
import type { RateCategory } from "../taxEffect";

// Step-0 check. The SAME income is reported on two different forms from related
// issuers: same recipient, same account reference, same income type, same
// amount — but different issuer names and EINs, so Block 1's DUPLICATE_DOCUMENT
// (which keys on issuer + form + EIN) cannot catch it. Here D28 (Northlake
// Securities composite, "1099-INT bank sweep program, Northlake Bank") and D29
// (Northlake Bank 1099-INT "bank sweep program for Northlake Securities account
// ending 7731") both report 1,840 interest on the SAME sweep account 7731.
// v3 counts both on SchB.1.1 + SchB.1.2 → interest overstated by 1,840.

const INCOME_FORMS = new Set(["SchB"]);

/** The account token both pages share (e.g. "7731" from "account ending 7731"). */
function accountToken(content: string): string | null {
  const m = content.match(/(?:account|acct|a\/c)\s+ending\s+(\d{3,})/i) ?? content.match(/ending\s+(\d{4})/i);
  return m ? m[1] : null;
}

/** Income type the line reports, from its form (interest, dividends, …). */
function incomeType(form: string | null | undefined): RateCategory | null {
  if (form === "SchB") return "interest";
  return null;
}

export const crossFormDuplicateIncome: Check = {
  id: "CROSS_FORM_DUPLICATE_INCOME",
  title: "Same income reported on two forms (cross-form duplicate)",
  area: "Wages & income",
  secondSource: "page_text",
  run({ model, versionId }): CheckResult[] {
    const out: CheckResult[] = [];

    // Collect income lines with a single extracted-value source we can anchor
    // to a document and account reference.
    interface Row {
      lineKey: string;
      docId: string;
      issuer: string;
      recipient: string;
      amount: bigint;
      type: RateCategory;
      token: string;
       evId: string;
    }
    const rows: Row[] = [];
    for (const ln of linesOf(model, versionId)) {
      if (!INCOME_FORMS.has(ln.form ?? "")) continue;
      const type = incomeType(ln.form);
      if (!type) continue;
      const evId = ln.sources.find((s) => /^ev-\d+$/.test(s));
      if (!evId) continue;
      const ev = model.evById.get(evId);
      if (!ev) continue;
      const doc = model.docById.get(ev.document_id);
      if (!doc) continue;
      const pageNo = ev.page ?? 1;
      const page = doc.pages.find((p) => p.page === pageNo) ?? doc.pages[0];
      const token = page ? accountToken(page.printed_content) : null;
      const amount = toCents(ln.value);
      if (!token || amount === null) continue;
      rows.push({
        lineKey: ln.key,
        docId: doc.id,
        issuer: doc.issuer ?? doc.id,
        recipient: doc.belongs_to ?? "",
        amount,
        type,
        token,
        evId,
      });
    }

    // Group by (income type, amount, recipient, account token).
    const groups = new Map<string, Row[]>();
    for (const r of rows) {
      const key = `${r.type}|${r.amount}|${r.recipient}|${r.token}`;
      const arr = groups.get(key);
      if (arr) arr.push(r);
      else groups.set(key, [r]);
    }

    for (const group of groups.values()) {
      const distinctDocs = new Set(group.map((g) => g.docId));
      const distinctIssuers = new Set(group.map((g) => g.issuer));
      // A real cross-form duplicate: >=2 different documents AND different
      // issuer names (otherwise DUPLICATE_DOCUMENT already owns it).
      if (distinctDocs.size < 2 || distinctIssuers.size < 2) continue;

      const sorted = [...group].sort((a, b) => a.lineKey.localeCompare(b.lineKey));
      const keep = sorted[0];
      const dups = sorted.slice(1);
      const amount = keep.amount;
      const type = keep.type;

      for (const dup of dups) {
        const delta = -amount; // remove the duplicate copy
        const effects = taxEffects(delta, type, { model, versionId });
        out.push(
          makeFinding({
            checkId: this.id,
            title: `Same ${type} (${(Number(amount) / 100).toLocaleString()}) reported on ${keep.docId} and ${dup.docId}`,
            area: this.area,
            secondSource: this.secondSource,
            status: "fail",
            expected: `counted once (account ending ${keep.token})`,
            actual: `counted on both ${keep.lineKey} and ${dup.lineKey}`,
            delta,
            taxEffectFed: effects.taxFed,
            taxEffectCa: effects.taxCa,
            paymentEffectFed: 0n,
            paymentEffectCa: 0n,
            rateCategory: type,
            refs: [dup.lineKey, keep.lineKey, dup.docId, keep.docId, dup.evId, keep.evId],
            primaryRefs: [dup.lineKey],
            explanation:
              `${keep.issuer} (${keep.docId}) and ${dup.issuer} (${dup.docId}) report the same ` +
              `${(Number(amount) / 100).toLocaleString()} of ${type} for the same recipient on the same sweep ` +
              `account ending ${keep.token}. The issuer names and forms differ, so the whole-document duplicate ` +
              `check does not catch it. The income must be counted once; ${dup.lineKey} is the duplicate copy.`,
          }),
        );
      }
    }
    return out;
  },
};
