import Link from "next/link";
import { loadModel } from "@/lib/packet/load";
import { getSession } from "@/lib/session";
import { currentVersion } from "@/lib/evidence/disposition";
import { line, lineValueCents } from "@/lib/checks/helpers";
import { toCents, formatCents } from "@/lib/money";
import { SectionTitle } from "@/components/ui";

// Side-by-side: books line -> Schedule C line -> difference -> reason.
interface BridgeRow {
  category: string;
  bookField: string | string[];
  lineKey: string | null;
  reason: string;
}

const BRIDGE: BridgeRow[] = [
  { category: "Gross receipts", bookField: "total_income", lineKey: "SchC.1", reason: "Engine added the Paywell 1099-K that is already in the books — double-counted (see THIRD_PARTY_VS_BOOKS)." },
  { category: "Depreciation", bookField: "Depreciation", lineKey: "SchC.13", reason: "Books use straight-line; the return claims bonus / §179 (Form 4562)." },
  { category: "Car and truck", bookField: "Car and truck - fuel", lineKey: "SchC.9", reason: "Return uses the standard mileage method, not booked fuel. Mileage itself is inflated by a duplicate log page (see DUPLICATE_PAGE)." },
  { category: "Meals", bookField: "Meals", lineKey: "SchC.24b", reason: "50% meals limitation applied for tax." },
  { category: "Advertising", bookField: "Advertising", lineKey: "SchC.8", reason: "Books = tax." },
  { category: "Contract labor", bookField: "Contract labor", lineKey: "SchC.11", reason: "Books = tax (1099 filing obligation flagged separately)." },
  { category: "Business insurance", bookField: "Insurance - business liability", lineKey: "SchC.15", reason: "Books = tax." },
  { category: "Legal & professional", bookField: "Legal and professional", lineKey: "SchC.17", reason: "Books = tax." },
  { category: "Office", bookField: "Office expenses", lineKey: "SchC.18", reason: "Books = tax." },
  { category: "Supplies", bookField: "Supplies", lineKey: "SchC.22", reason: "Books = tax." },
  { category: "Travel", bookField: "Travel", lineKey: "SchC.24a", reason: "Books = tax." },
  { category: "Utilities (phone + internet)", bookField: ["Telephone", "Internet"], lineKey: "SchC.25", reason: "Telephone + internet combined into utilities." },
  { category: "Health insurance (Erik)", bookField: "Insurance - health (Erik)", lineKey: null, reason: "Self-employed health insurance is an adjustment on Schedule 1, not a Schedule C expense." },
];

export default async function BooksToTaxPage() {
  const model = loadModel();
  const session = await getSession();
  const versionId = currentVersion(model, session.asOf)?.version ?? "v3";

  const booksDoc = model.documents.find((d) => d.document_type === "books_profit_loss");
  const bookEv = (fieldOrFields: string | string[]) => {
    const fields = Array.isArray(fieldOrFields) ? fieldOrFields : [fieldOrFields];
    let total: bigint | null = null;
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
    return { ...r, booksCents: books.cents, bookIds: books.ids, taxCents: tax, diff };
  });

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Business books → taxable income</h1>
      <p className="text-sm text-slate-500">
        {booksDoc?.title}. Each row ties the books figure to its Schedule C line, the difference, and why. Click any row&apos;s
        evidence.
      </p>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Books</th>
              <th className="px-3 py-2">Tax (Schedule C)</th>
              <th className="px-3 py-2">Difference</th>
              <th className="px-3 py-2">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.category} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2 font-medium">{r.category}</td>
                <td className="px-3 py-2 mono">
                  {r.bookIds.length ? (
                    <Link href={`/doc/${booksDoc?.id}`} className="mono">
                      {formatCents(r.booksCents)}
                    </Link>
                  ) : (
                    formatCents(r.booksCents)
                  )}
                </td>
                <td className="px-3 py-2 mono">
                  {r.lineKey ? (
                    <Link href={`/line/${versionId}/${encodeURIComponent(r.lineKey)}`} className="mono">
                      {formatCents(r.taxCents)}
                    </Link>
                  ) : (
                    "— (Schedule 1)"
                  )}
                </td>
                <td className="px-3 py-2 mono">
                  {r.diff === null || r.diff === 0n ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <span className={r.diff > 0n ? "text-red-700" : "text-emerald-700"}>{formatCents(r.diff)}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600">{r.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle>Reconcile</SectionTitle>
      <p className="text-sm text-slate-600">
        Books net income {formatCents(bookEv("net_income").cents)} vs Schedule C net profit{" "}
        <Link href={`/line/${versionId}/SchC.31`}>SchC.31</Link> = {formatCents(lineValueCents(line(model, versionId, "SchC.31")))}. The
        differences above (depreciation, mileage, meals, the 1099-K, and health insurance moving off Schedule C) explain the
        gap.
      </p>
    </div>
  );
}
