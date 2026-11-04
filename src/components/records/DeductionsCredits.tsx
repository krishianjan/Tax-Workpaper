import { RecordShell } from "./RecordShell";
import type { RecordCtx } from "@/lib/records/ctx";
import { line, lineValueCents } from "@/lib/checks/helpers";
import { formatCents, type Cents } from "@/lib/money";
import { tieOut, type TieOut } from "@/lib/records/tieout";

export function DeductionsCredits({ model, versionId, meta }: RecordCtx) {
  const L = (k: string): Cents | null => lineValueCents(line(model, versionId, k));
  const f = (c: Cents | null) => formatCents(c);

  const rows: Array<{ item: string; input: string; limit: string; allowed: string; note: string }> = [
    { item: "SALT (state + property tax)", input: f(L("SchA.5d")), limit: f(L("SchA.5e")), allowed: f(L("SchA.7")), note: "R-SALT-CAP: 40,000 cap, reduced 30% over MAGI 500,000, floor 10,000. Disallowed 1,290." },
    { item: "Home mortgage interest", input: f(L("SchA.8e")), limit: "750k acquisition debt", allowed: f(L("SchA.8e")), note: "Home bought 2025-07-08 for 685,000; refinance points amortized (1/360)." },
    { item: "Charitable gifts", input: f(L("SchA.14")), limit: "AGI % limits", allowed: f(L("SchA.14")), note: "Cash 3,350 + noncash 20,500 (Form 8283)." },
    { item: "Dependent care (F2441)", input: f(L("F2441.2")), limit: f(L("F2441.12")) + " benefits excluded", allowed: f(L("F2441.31")), note: "Credit 0 after employer dependent-care benefits." },
    { item: "Child tax credit / ODC", input: "—", limit: "phase-out over MAGI", allowed: f(L("F1040.19")), note: "ODC for dependents after phase-out." },
    { item: "AOTC (F8863)", input: f(L("F8863.30")), limit: "MAGI phase-out", allowed: f(L("F8863.7")), note: "Tentative 2,500 → 0 after phase-out (income too high)." },
    { item: "QBI deduction", input: "—", limit: f(L("F8995.36")), allowed: f(L("F8995.39")), note: "Income-limited; Studio + Woodworks components." },
  ];

  const tieOuts: TieOut[] = [
    tieOut("Total itemized deductions", "F1040.12", L("SchA.17") ?? 0n, L("F1040.12")),
  ];

  return (
    <RecordShell title="12. Deductions and credits with limits" slug="deductions-credits" meta={meta} tieOuts={tieOuts}>
      <div className="card scroll-box">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Input</th>
              <th className="px-3 py-2">Limit</th><th className="px-3 py-2 text-right">Allowed</th><th className="px-3 py-2">Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.item} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2 font-medium">{r.item}</td>
                <td className="px-3 py-2 text-right mono">{r.input}</td>
                <td className="px-3 py-2 text-xs">{r.limit}</td>
                <td className="px-3 py-2 text-right mono">{r.allowed}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Itemized {f(L("SchA.17"))} vs standard deduction — the what-if screen shows the comparison.</p>
    </RecordShell>
  );
}
