import Link from "next/link";
import { RecordShell } from "./RecordShell";
import { NumberCell } from "./NumberCell";
import type { RecordCtx } from "@/lib/records/ctx";
import { toCents } from "@/lib/money";

export function StateSplit({ model, versionId, meta }: RecordCtx) {
  const residency = ((model.raw.household as Record<string, unknown>).residency ?? []) as Array<Record<string, unknown>>;
  const ca = (model.versionById.get(versionId)?.summary as Record<string, Record<string, unknown>> | undefined)?.california ?? {};

  const items: Array<{ label: string; note: string }> = [
    { label: "Wages (CA-source split)", note: "Part-year CA resident to 2025-07-15; the all-CA wage split is a judgment call (STATE_SOURCE_WAGES)." },
    { label: "RSU sales while CA resident", note: "N1/N3 taxed to CA at ca_source_income; N4 sold after the move (TX)." },
    { label: "1450 Fremont rental", note: "California-source (property in Sacramento)." },
    { label: "Ridgeline K-1 CA share", note: "D38 state supplement: CA 22% / TX / AZ composite / NV." },
    { label: "HSA addback", note: "California does not conform to the HSA deduction — added back to CA income." },
  ];

  return (
    <RecordShell title="14. State split" slug="state-split" meta={meta}>
      <div className="card p-3 text-sm">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Residency (part-year 540NR)</div>
        <ul className="space-y-0.5">
          {residency.map((r, i) => (
            <li key={i} className="mono text-xs">{String(r.state)}: {String(r.from)} → {String(r.to)}</li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="card p-4"><div className="text-xs uppercase text-slate-500">Total AGI</div><div className="mt-1 text-2xl font-semibold"><NumberCell cents={toCents(ca.total_agi)} /></div></div>
        <div className="card p-4"><div className="text-xs uppercase text-slate-500">California AGI</div><div className="mt-1 text-2xl font-semibold"><NumberCell cents={toCents(ca.ca_agi)} /></div></div>
      </div>

      <div className="card scroll-box">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">CA-source item</th><th className="px-3 py-2">Treatment</th></tr></thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.label} className="border-t border-slate-100"><td className="px-3 py-2 font-medium">{r.label}</td><td className="px-3 py-2 text-xs text-slate-500">{r.note}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Full column detail (A federal · B subtractions · C additions · D total · E CA-source) on the <Link href="/schedules/state-split">state-split schedule</Link>.</p>
    </RecordShell>
  );
}
