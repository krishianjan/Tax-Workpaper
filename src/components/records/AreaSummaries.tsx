import { RecordShell } from "./RecordShell";
import type { RecordCtx } from "@/lib/records/ctx";
import { runChecks } from "@/lib/checks/runner";
import { groupIssues } from "@/lib/issues/group";
import { completenessAreas, areaOfIssue, computeAreaReadiness } from "@/lib/judgment/completeness";
import { buildBudgetReport } from "@/lib/firm/budget";
import { loadTimeEntries } from "@/lib/firm/store";

const h = (min: number) => (min / 60).toFixed(1);

export async function AreaSummaries({ model, versionId, meta }: RecordCtx) {
  const findings = runChecks({ model, versionId });
  const issues = groupIssues(model, findings, versionId);
  const budget = buildBudgetReport(model, await loadTimeEntries(), meta.generatedAt);

  const areas = completenessAreas(model);
  const issuesByArea = new Map<string, number>();
  for (const i of issues) {
    if (i.worstStatus === "info") continue;
    const a = areaOfIssue(i);
    issuesByArea.set(a, (issuesByArea.get(a) ?? 0) + 1);
  }

  const rows = areas.map((area) => {
    const openIssues = issuesByArea.get(area) ?? 0;
    const readiness = computeAreaReadiness({ area, openIssues, pendingDecisions: 0, undisposedDocs: 0, attestedBy: null });
    const b = budget.byArea.find((x) => x.area === area);
    return { area, openIssues, readiness, budgetMin: b?.budgetMinutes ?? 0, actualMin: b?.actualMinutes ?? 0, pct: b?.pct ?? 0 };
  });

  return (
    <RecordShell title="3. Area summaries" slug="area-summaries" meta={meta}>
      <p className="text-xs text-slate-500">One row per area: open issues, computed readiness, and time vs budget. Attestation happens on the Completeness screen.</p>
      <div className="card scroll-box">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Area</th>
              <th className="px-3 py-2 text-right">Open issues</th>
              <th className="px-3 py-2 text-right">Budget (h)</th>
              <th className="px-3 py-2 text-right">Actual (h)</th>
              <th className="px-3 py-2">Readiness</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.area} className="border-t border-slate-100">
                <td className="px-3 py-2">{r.area.replace(/_/g, " ")}</td>
                <td className={`px-3 py-2 text-right ${r.openIssues ? "text-red-700" : ""}`}>{r.openIssues}</td>
                <td className="px-3 py-2 text-right mono">{h(r.budgetMin)}</td>
                <td className="px-3 py-2 text-right mono">{h(r.actualMin)}</td>
                <td className="px-3 py-2">
                  <span className={`chip ${r.readiness.computed === "green" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                    {r.readiness.computed}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </RecordShell>
  );
}
