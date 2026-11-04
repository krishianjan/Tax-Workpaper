import Link from "next/link";
import { RecordShell } from "./RecordShell";
import { NumberCell } from "./NumberCell";
import { buildSummaryVsLastYear } from "@/lib/records/summaryVsLastYear";
import type { RecordCtx } from "@/lib/records/ctx";

export function SummaryVsLastYear({ model, versionId, mode, adjustments, meta }: RecordCtx) {
  const { rows, tieOuts } = buildSummaryVsLastYear(model, versionId, mode, adjustments);
  return (
    <RecordShell title="1. Return summary vs last year" slug="summary-vs-last-year" meta={meta} tieOuts={tieOuts}>
      <div className="card scroll-box">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Line</th>
              <th className="px-3 py-2 text-right">2024 (prior)</th>
              <th className="px-3 py-2 text-right">2025 engine</th>
              <th className="px-3 py-2 text-right">{meta.modeLabel}</th>
              <th className="px-3 py-2 text-right">Swing vs 2024</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.lineKey} className="border-t border-slate-100">
                <td className="px-3 py-2">{r.label}</td>
                <td className="px-3 py-2 text-right"><NumberCell cents={r.prior} /></td>
                <td className="px-3 py-2 text-right"><NumberCell cents={r.engine} lineKey={r.lineKey} /></td>
                <td className="px-3 py-2 text-right"><NumberCell cents={r.current} lineKey={r.lineKey} adjusted={mode !== "engine" && r.current !== r.engine} /></td>
                <td className={`px-3 py-2 text-right ${(r.swing ?? 0n) > 0n ? "text-red-700" : "text-emerald-700"}`}>
                  <NumberCell cents={r.swing} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        AGI and taxable income are engine-level; tax, payments and balance in {meta.modeLabel} carry the Σ of approved effects.
        Each swing’s explanation lives in its <Link href="/issues">Issues</Link> and <Link href="/decisions">Decisions</Link>.
      </p>
    </RecordShell>
  );
}
