import { loadModel } from "@/lib/packet/load";
import { getSession } from "@/lib/session";
import { currentVersion } from "@/lib/evidence/disposition";
import { loadAdjustments } from "@/lib/change/store";
import { loadDecisions } from "@/lib/judgment/store";
import { computeSwings, flaggedSwings, unexplainedFlagged, unmatchedPriorYearLines } from "@/lib/judgment/variance";
import { formatDollars } from "@/lib/money";
import { SectionTitle, Stat } from "@/components/ui";
import { explainVariance } from "@/app/judgment-actions";

export default async function VariancePage() {
  const model = loadModel();
  const session = await getSession();
  const versionId = currentVersion(model, session.asOf)?.version ?? "v3";
  const adjustments = await loadAdjustments();
  const decisions = await loadDecisions();

  const explained = new Set(
    decisions.filter((d) => d.type === "variance_explanation").map((d) => d.issueId?.replace("variance:", "") ?? ""),
  );
  const swings = computeSwings(model, versionId, adjustments);
  const flagged = flaggedSwings(swings);
  const unexplained = unexplainedFlagged(swings, explained);
  const unmatched = unmatchedPriorYearLines(model, versionId);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Prior-year variances</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Flagged swings" value={flagged.length} />
        <Stat label="Unexplained (blocks filing)" value={unexplained.length} />
        <Stat label="Unmatched 2024 lines" value={unmatched.length} />
        <Stat label="Explanations recorded" value={explained.size} />
      </div>

      <SectionTitle>Flagged swings (2024 → engine → final)</SectionTitle>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">Line</th><th className="px-3 py-2">2024</th><th className="px-3 py-2">Engine</th><th className="px-3 py-2">Final</th><th className="px-3 py-2">Δ</th><th className="px-3 py-2">Explained?</th></tr>
          </thead>
          <tbody>
            {flagged.map((s) => (
              <tr key={s.key2025} className="border-t border-slate-100">
                <td className="px-3 py-2 mono">{s.key2025}</td>
                <td className="px-3 py-2 mono">{formatDollars(s.old)}</td>
                <td className="px-3 py-2 mono">{formatDollars(s.engine)}</td>
                <td className="px-3 py-2 mono">{formatDollars(s.final)}</td>
                <td className="px-3 py-2 mono">{formatDollars(s.changeFromFinal)}</td>
                <td className="px-3 py-2">
                  {explained.has(s.key2025) ? (
                    <span className="chip bg-emerald-100 text-emerald-800">explained</span>
                  ) : (
                    <form action={explainVariance} className="flex flex-wrap items-center gap-1">
                      <input type="hidden" name="key2025" value={s.key2025} />
                      <select name="explanationType" className="rounded border border-slate-300 px-1 py-0.5 text-xs">
                        <option value="explained_by_event">event</option>
                        <option value="caused_by_issue">issue</option>
                        <option value="unexplained">unexplained</option>
                      </select>
                      <input name="refs" placeholder="refs" className="w-24 rounded border border-slate-300 px-1 py-0.5 text-xs" />
                      <input name="reason" placeholder="reason (≥10)" className="w-40 rounded border border-slate-300 px-1 py-0.5 text-xs" required minLength={10} />
                      <button className="rounded bg-slate-900 px-2 py-0.5 text-xs text-white">explain</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle>Unmatched 2024 lines (each needs a disposition)</SectionTitle>
      <ul className="space-y-1 text-sm">
        {unmatched.map((e) => (
          <li key={e.key2024} className="card p-2">
            <span className="mono">{e.key2024}</span> <span className="text-slate-500">— {e.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
