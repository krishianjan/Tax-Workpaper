import { RecordShell } from "./RecordShell";
import type { RecordCtx } from "@/lib/records/ctx";

const money = (x: unknown) => (typeof x === "number" ? x.toLocaleString() : x == null ? "—" : String(x));

export function BasisByYear({ model, meta }: RecordCtx) {
  const recs = (model.raw.prior_years as Record<string, unknown>).basis_records as Record<string, Array<Record<string, unknown>>>;
  const scorp = recs.scorp_lindqvist_family_woodworks ?? [];
  const ridgeline = recs.partnership_ridgeline ?? [];
  const ira = recs.ira_nondeductible_basis_ngozi ?? [];
  const home = recs.home_7709_barton_ridge ?? [];

  return (
    <RecordShell title="16. Basis by year" slug="basis-by-year" meta={meta}>
      <div className="card scroll-box">
        <div className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">S-corp stock basis ledger (Woodworks)</div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Year</th><th className="px-3 py-2 text-right">K-1 income</th><th className="px-3 py-2 text-right">Distributions</th><th className="px-3 py-2 text-right">Ending basis</th><th className="px-3 py-2">Source</th></tr></thead>
          <tbody>
            {scorp.map((r, i) => (
              <tr key={i} className={`border-t border-slate-100 ${r.ending_stock_basis == null ? "bg-amber-50" : ""}`}>
                <td className="px-3 py-2 mono">{money(r.year)}</td>
                <td className="px-3 py-2 text-right mono">{money(r.k1_income)}</td>
                <td className="px-3 py-2 text-right mono">{money(r.distributions)}</td>
                <td className="px-3 py-2 text-right mono">{r.ending_stock_basis == null ? <span className="chip bg-amber-100 text-amber-800">gap</span> : money(r.ending_stock_basis)}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{String(r.source ?? "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card scroll-box">
        <div className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Ridgeline — capital account vs outside basis</div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Year</th><th className="px-3 py-2 text-right">Ending capital account</th><th className="px-3 py-2 text-right">Outside basis</th><th className="px-3 py-2">Source</th></tr></thead>
          <tbody>
            {ridgeline.map((r, i) => (
              <tr key={i} className={`border-t border-slate-100 ${r.outside_basis == null ? "bg-amber-50" : ""}`}>
                <td className="px-3 py-2 mono">{money(r.year)}</td>
                <td className="px-3 py-2 text-right mono">{money(r.ending_capital_account)}</td>
                <td className="px-3 py-2 text-right mono">{r.outside_basis == null ? <span className="chip bg-amber-100 text-amber-800">never computed</span> : money(r.outside_basis)}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{String(r.source ?? "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="card p-3 text-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">IRA nondeductible basis (Ngozi)</div>
          {ira.map((r, i) => <p key={i}>{money(r.year)} Form 8606 line 14: <span className="mono">{money(r.form_8606_line_14)}</span> <span className="text-xs text-slate-400">({String(r.source ?? "")})</span></p>)}
        </div>
        <div className="card p-3 text-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Home — 7709 Barton Ridge</div>
          {home.map((r, i) => <p key={i}>{String(r.event)}: <span className="mono">{money(r.price)}</span> <span className="text-xs text-slate-400">({String(r.source ?? "")})</span></p>)}
        </div>
      </div>
      <p className="text-xs text-slate-500">Gaps (amber) are raised as BASIS_GAP issues — the CPA must reconstruct them before relying on a loss limitation or gain.</p>
    </RecordShell>
  );
}
