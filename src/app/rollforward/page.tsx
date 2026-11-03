import { loadModel } from "@/lib/packet/load";
import { loadAdjustments } from "@/lib/change/store";
import { returnTotals } from "@/lib/change/effective";
import { carryoversForward, expectedDocuments2026, estimates2026 } from "@/lib/filing/rollforward";
import { formatCents } from "@/lib/money";
import { SectionTitle } from "@/components/ui";

export default async function RollforwardPage() {
  const model = loadModel();
  const adjustments = await loadAdjustments();
  const fin = returnTotals(model, "v3", "final", adjustments);
  const carryovers = carryoversForward(model, adjustments);
  const docs = expectedDocuments2026(model);
  const est = estimates2026(model, fin.taxFed, fin.taxCa);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Rollforward to 2026</h1>
      <p className="text-sm text-slate-500">
        Carryovers come from v3 <span className="mono">carryovers_out</span>, adjusted by the approved final changes, each
        with provenance. Next-year expected documents exclude sources that ended in 2025.
      </p>

      <SectionTitle>Carryovers into 2026 ({carryovers.length})</SectionTitle>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Carryover</th><th className="px-3 py-2">Jur.</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Provenance</th></tr></thead>
          <tbody>
            {carryovers.map((c) => (
              <tr key={`${c.jurisdiction}-${c.key}`} className="border-t border-slate-100">
                <td className="px-3 py-2">{c.key.replace(/_/g, " ")}</td>
                <td className="px-3 py-2">{c.jurisdiction}</td>
                <td className="px-3 py-2 mono">{formatCents(c.amountCents)}</td>
                <td className="px-3 py-2 text-xs text-slate-400">{c.provenance.version}/{c.provenance.source}{c.provenance.adjustmentIds.length ? ` · adj ${c.provenance.adjustmentIds.join(",")}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle>Expected 2026 documents</SectionTitle>
      <ul className="space-y-1 text-sm">
        {docs.map((d, i) => (
          <li key={i} className="card p-2">
            <span className={`chip ${d.status === "ended" ? "bg-slate-200 text-slate-600" : "bg-emerald-100 text-emerald-800"}`}>{d.status}</span> {d.issuer} · {d.documentType}
            {d.reason ? <span className="ml-2 text-xs text-slate-400">{d.reason}</span> : null}
          </li>
        ))}
      </ul>

      <SectionTitle>2026 estimates ({est.note})</SectionTitle>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-3">
          <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Federal — 110% of 2025, 4 equal</div>
          <ul className="text-sm">{est.federal.map((i) => <li key={i.date} className="mono">{i.date}: {formatCents(i.amountCents)}</li>)}</ul>
        </div>
        <div className="card p-3">
          <div className="mb-1 text-xs font-semibold uppercase text-slate-500">California — 30/40/30, CA-source only</div>
          <ul className="text-sm">{est.california.map((i) => <li key={i.date} className="mono">{i.date}: {formatCents(i.amountCents)}</li>)}</ul>
        </div>
      </div>
    </div>
  );
}
