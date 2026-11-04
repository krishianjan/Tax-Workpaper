import Link from "next/link";
import { RecordShell } from "./RecordShell";
import { NumberCell } from "./NumberCell";
import type { RecordCtx } from "@/lib/records/ctx";
import { line, lineValueCents } from "@/lib/checks/helpers";
import { toCents, formatCents, type Cents } from "@/lib/money";
import { tieOut, type TieOut } from "@/lib/records/tieout";

interface BridgeRow {
  category: string;
  bookField: string | string[];
  lineKey: string | null;
  reason: string;
}

const BRIDGE: BridgeRow[] = [
  { category: "Gross receipts", bookField: "total_income", lineKey: "SchC.1", reason: "Engine added the Paywell 1099-K already in the books — double-counted (THIRD_PARTY_VS_BOOKS)." },
  { category: "Depreciation", bookField: "Depreciation", lineKey: "SchC.13", reason: "Books use straight-line; return claims bonus / §179." },
  { category: "Car and truck", bookField: "Car and truck - fuel", lineKey: "SchC.9", reason: "Return uses standard mileage; mileage inflated by a duplicate log page (DUPLICATE_PAGE)." },
  { category: "Meals", bookField: "Meals", lineKey: "SchC.24b", reason: "50% meals limitation for tax." },
  { category: "Utilities (phone + internet)", bookField: ["Telephone", "Internet"], lineKey: "SchC.25", reason: "Phone 70% / internet 50% business-use judgment." },
  { category: "Health insurance (Erik)", bookField: "Insurance - health (Erik)", lineKey: null, reason: "SE health insurance is a Schedule 1 adjustment, not a Schedule C expense." },
];

export function BooksToTax({ model, versionId, meta }: RecordCtx) {
  const booksDoc = model.documents.find((d) => d.document_type === "books_profit_loss");
  const bookEv = (fieldOrFields: string | string[]): { cents: Cents | null; ids: string[] } => {
    const fields = Array.isArray(fieldOrFields) ? fieldOrFields : [fieldOrFields];
    let total: Cents | null = null;
    const ids: string[] = [];
    for (const f of fields) {
      const ev = (model.evsByDoc.get(booksDoc?.id ?? "") ?? []).find((e) => e.field === f);
      if (ev) {
        total = (total ?? 0n) + (toCents(ev.value) ?? 0n);
        ids.push(ev.id);
      }
    }
    return { cents: total, ids };
  };

  const rows = BRIDGE.map((r) => {
    const books = bookEv(r.bookField);
    const tax = r.lineKey ? lineValueCents(line(model, versionId, r.lineKey)) : 0n;
    const diff = tax !== null && books.cents !== null ? tax - books.cents : null;
    return { ...r, booksCents: books.cents, taxCents: tax, diff };
  });

  const tieOuts: TieOut[] = [
    tieOut("Schedule C net profit", "SchC.31", lineValueCents(line(model, versionId, "SchC.31")) ?? 0n, lineValueCents(line(model, versionId, "SchC.31"))),
  ];

  return (
    <RecordShell title="7. Books to tax" slug="books-to-tax" meta={meta} tieOuts={tieOuts}>
      <p className="text-xs text-slate-500">{booksDoc?.title}. Each row ties a books figure to its Schedule C line, the difference, and why.</p>
      <div className="card scroll-box">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Category</th><th className="px-3 py-2 text-right">Books</th>
              <th className="px-3 py-2 text-right">Tax (Sch C)</th><th className="px-3 py-2 text-right">Diff</th><th className="px-3 py-2">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.category} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2 font-medium">{r.category}</td>
                <td className="px-3 py-2 text-right">{booksDoc ? <Link href={`/doc/${booksDoc.id}/p/1`} className="mono">{formatCents(r.booksCents)}</Link> : <span className="mono">{formatCents(r.booksCents)}</span>}</td>
                <td className="px-3 py-2 text-right">{r.lineKey ? <NumberCell cents={r.taxCents} lineKey={r.lineKey} /> : <span className="text-slate-400">Sch 1</span>}</td>
                <td className="px-3 py-2 text-right mono">{r.diff === null || r.diff === 0n ? <span className="text-slate-400">—</span> : <span className={r.diff > 0n ? "text-red-700" : "text-emerald-700"}>{formatCents(r.diff)}</span>}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{r.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-slate-600">
        Books net income {formatCents(bookEv("net_income").cents)} vs Schedule C net profit{" "}
        <NumberCell cents={lineValueCents(line(model, versionId, "SchC.31"))} lineKey="SchC.31" />. The differences above explain the gap.
      </p>
    </RecordShell>
  );
}
