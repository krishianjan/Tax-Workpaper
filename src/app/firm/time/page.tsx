import { loadModel } from "@/lib/packet/load";
import { getSession } from "@/lib/session";
import { SectionTitle, Stat } from "@/components/ui";
import { buildBudgetReport, type BudgetAlert } from "@/lib/firm/budget";
import { loadTimeEntries } from "@/lib/firm/store";

const ALERT_STYLE: Record<BudgetAlert, string> = {
  none: "bg-slate-100 text-slate-600",
  warn_80: "bg-amber-100 text-amber-800",
  over_100: "bg-red-100 text-red-800",
};

const h = (min: number) => (min / 60).toFixed(1);

export default async function TimeBudgetPage() {
  const model = loadModel();
  const session = await getSession();
  const report = buildBudgetReport(model, await loadTimeEntries(), session.asOf);
  const totalPct = report.totalBudgetMinutes > 0 ? (report.totalActualMinutes / report.totalBudgetMinutes) * 100 : 0;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Time vs budget</h1>
      <p className="text-sm text-slate-500">Season to date as of {session.asOf.slice(0, 10)}. Partner review hours are tracked separately.</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Budget (h)" value={h(report.totalBudgetMinutes)} />
        <Stat label="Actual (h)" value={h(report.totalActualMinutes)} sub={`${totalPct.toFixed(0)}% used`} />
        <Stat label="Partner review (h)" value={`${h(report.partnerReview.actualMinutes)} / ${h(report.partnerReview.budgetMinutes)}`} />
      </div>

      <SectionTitle>By area</SectionTitle>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Area</th><th className="px-3 py-2">Budget</th><th className="px-3 py-2">Actual</th>
              <th className="px-3 py-2">Remaining</th><th className="px-3 py-2">Used</th>
            </tr>
          </thead>
          <tbody>
            {report.byArea.map((a) => (
              <tr key={a.area} className="border-t border-slate-100">
                <td className="px-3 py-2">{a.area.replace(/_/g, " ")}</td>
                <td className="px-3 py-2 mono">{h(a.budgetMinutes)}</td>
                <td className="px-3 py-2 mono">{h(a.actualMinutes)}</td>
                <td className={`px-3 py-2 mono ${a.remainingMinutes < 0 ? "text-red-700" : ""}`}>{h(a.remainingMinutes)}</td>
                <td className="px-3 py-2"><span className={`chip ${ALERT_STYLE[a.alert]}`}>{Number.isFinite(a.pct) ? a.pct.toFixed(0) : "∞"}%</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle>By staff</SectionTitle>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">Staff</th><th className="px-3 py-2">Hours</th></tr>
          </thead>
          <tbody>
            {report.byStaff.length === 0 ? (
              <tr><td className="px-3 py-3 text-slate-500" colSpan={2}>No time logged yet.</td></tr>
            ) : (
              report.byStaff.map((s) => (
                <tr key={s.staffId} className="border-t border-slate-100">
                  <td className="px-3 py-2">{s.staffId} · {model.staffById.get(s.staffId)?.role ?? ""}</td>
                  <td className="px-3 py-2 mono">{h(s.minutes)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <SectionTitle>Burn-down</SectionTitle>
      <div className="card p-3 text-sm">
        {report.burndown.length === 0 ? (
          <p className="text-slate-500">No time logged before the as-of date.</p>
        ) : (
          <ul className="space-y-1">
            {report.burndown.map((b) => (
              <li key={b.date} className="flex items-center gap-2">
                <span className="mono w-24">{b.date}</span>
                <span className="h-2 rounded bg-slate-400" style={{ width: `${Math.min(100, (b.cumulativeMinutes / Math.max(1, report.totalBudgetMinutes)) * 100)}%` }} />
                <span className="text-xs text-slate-500">{h(b.cumulativeMinutes)}h</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
