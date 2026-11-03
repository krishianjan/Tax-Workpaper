import type { Check, CheckResult } from "./types";
import { makeFinding } from "./types";
import { line, lineValueCents } from "./helpers";
import { toCents, formatCents } from "../money";
import { taxEffect } from "../taxEffect";

// Gross receipts: books revenue vs 1099-NEC total + 1099-K + non-1099 deposits,
// using the deposit detail to see whether the 1099-K is already inside the
// books. Books 151,300 (D14). The Paywell 1099-K 12,400 (D21) is inside Atlas's
// 41,200 per D15 p3, so it is already in the books — the engine added it again,
// overstating SchC.1 = 163,700 by 12,400.

export const thirdPartyVsBooks: Check = {
  id: "THIRD_PARTY_VS_BOOKS",
  title: "Schedule C gross receipts: books vs third-party forms",
  area: "Schedule C",
  secondSource: "deposit_detail",
  run({ model, versionId }): CheckResult[] {
    const grossLine = line(model, versionId, "SchC.1");
    if (!grossLine) return [];
    const engine = lineValueCents(grossLine) ?? 0n;

    // Books revenue
    const booksDoc = model.documents.find((d) => d.document_type === "books_profit_loss");
    const booksEv = booksDoc
      ? (model.evsByDoc.get(booksDoc.id) ?? []).find((e) => /total_income|total income|revenue/i.test(e.field))
      : undefined;
    if (!booksEv) return [];
    const books = toCents(booksEv.value) ?? 0n;

    // 1099-K
    const kDoc = model.documents.find((d) => d.document_type === "1099-K");
    const kEv = kDoc ? (model.evsByDoc.get(kDoc.id) ?? []).find((e) => /box_?1a|gross/i.test(e.field)) : undefined;
    const k = kEv ? (toCents(kEv.value) ?? 0n) : 0n;

    // Deposit detail text — does it say the 1099-K processor is already in the books?
    const depDoc = model.documents.find((d) => d.document_type === "books_transaction_detail");
    const depText = depDoc ? depDoc.pages.map((p) => p.printed_content).join(" ") : "";
    const kInsideBooks = kEv && /through\s+\w+\s+Payments|card processing|paywell/i.test(depText);

    const out: CheckResult[] = [];
    if (k > 0n && engine - books === k && kInsideBooks) {
      const delta = -k; // SchC.1 should drop to books
      const te = taxEffect(delta, "schc_profit", { model, versionId });
      out.push(
        makeFinding({
          checkId: this.id,
          title: "Schedule C gross receipts double-count the 1099-K",
          area: this.area,
          secondSource: this.secondSource,
          status: "fail",
          expected: formatCents(books),
          actual: formatCents(engine),
          delta,
          taxEffectFed: te.fed,
          taxEffectCa: te.ca,
          rateCategory: "schc_profit",
          refs: ["SchC.1", booksEv.id, kEv!.id, depDoc?.id ?? ""].filter(Boolean),
          primaryRefs: [`${versionId}:SchC.1`],
          explanation: `Engine SchC.1 = ${formatCents(engine)} = books ${formatCents(books)} + 1099-K ${formatCents(k)}. The deposit detail shows the 1099-K is already inside the books (card processing within a 1099-NEC payer), so it is counted twice. Correct gross receipts = ${formatCents(books)}.`,
        }),
      );
    } else if (engine !== books) {
      out.push(
        makeFinding({
          checkId: this.id,
          title: "Schedule C gross receipts differ from books",
          area: this.area,
          secondSource: this.secondSource,
          status: "warn",
          expected: formatCents(books),
          actual: formatCents(engine),
          delta: books - engine,
          refs: ["SchC.1", booksEv.id],
          primaryRefs: [`${versionId}:SchC.1`],
          explanation: `Engine SchC.1 = ${formatCents(engine)} vs books ${formatCents(books)}. Reconcile against 1099 forms and deposit detail.`,
        }),
      );
    }
    return out;
  },
};
