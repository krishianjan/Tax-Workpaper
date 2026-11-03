import Link from "next/link";
import { loadModel } from "@/lib/packet/load";
import { compareSides, type Cause } from "@/lib/change/compare";
import { loadAdjustments } from "@/lib/change/store";
import { formatCents } from "@/lib/money";
import { SectionTitle } from "@/components/ui";

const CAUSE_STYLE: Record<Cause, string> = {
  engine: "bg-sky-100 text-sky-800",
  adjustment: "bg-violet-100 text-violet-800",
  both: "bg-amber-100 text-amber-800",
  unknown: "bg-slate-100 text-slate-600",
};

const SIDES = ["v1", "v2", "v3", "final", "preview"];

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const sp = await searchParams;
  const a = sp.a ?? "v2";
  const b = sp.b ?? "v3";
  const model = loadModel();
  const adjustments = await loadAdjustments();
  const result = compareSides(model, a, b, adjustments);
  const s = result.summary;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Compare</h1>
      <div className="flex flex-wrap gap-2 text-sm">
        {SIDES.map((x) => (
          <Link key={`a${x}`} href={`/compare?a=${x}&b=${b}`} className={`chip ${a === x ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>
            A: {x}
          </Link>
        ))}
        <span className="mx-2 text-slate-300">|</span>
        {SIDES.map((x) => (
          <Link key={`b${x}`} href={`/compare?a=${a}&b=${x}`} className={`chip ${b === x ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>
            B: {x}
          </Link>
        ))}
      </div>

      <section>
        <SectionTitle>Summary deltas (B − A)</SectionTitle>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr><th className="px-3 py-2"></th><th className="px-3 py-2">Tax (fed)</th><th className="px-3 py-2">Tax (CA)</th><th className="px-3 py-2">Payments (fed)</th><th className="px-3 py-2">Balance (fed)</th><th className="px-3 py-2">Balance (CA)</th></tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium">Δ ({b} − {a})</td>
                <td className="px-3 py-2 mono">{formatCents(s.taxFedB - s.taxFedA)}</td>
                <td className="px-3 py-2 mono">{formatCents(s.taxCaB - s.taxCaA)}</td>
                <td className="px-3 py-2 mono">{formatCents(s.payFedB - s.payFedA)}</td>
                <td className="px-3 py-2 mono">{formatCents(s.balFedB - s.balFedA)}</td>
                <td className="px-3 py-2 mono">{formatCents(s.balCaB - s.balCaA)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {result.changelogMismatches.length > 0 ? (
        <div className="card border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Engine diffs not in changes_from_previous: {result.changelogMismatches.join(", ")}
        </div>
      ) : null}

      <section>
        <SectionTitle>Changed lines ({result.lineDiffs.length}) with cause</SectionTitle>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr><th className="px-3 py-2">Line</th><th className="px-3 py-2">{a}</th><th className="px-3 py-2">{b}</th><th className="px-3 py-2">Cause</th><th className="px-3 py-2">Detail</th></tr>
            </thead>
            <tbody>
              {result.lineDiffs.slice(0, 400).map((d) => (
                <tr key={d.key} className="border-t border-slate-100">
                  <td className="px-3 py-2 mono">{d.key}</td>
                  <td className="px-3 py-2 mono">{String(d.aValue)}</td>
                  <td className="px-3 py-2 mono">{String(d.bValue)}</td>
                  <td className="px-3 py-2"><span className={`chip ${CAUSE_STYLE[d.cause]}`}>{d.cause}</span></td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {d.adjustmentIds.length ? `adj ${d.adjustmentIds.join(", ")}` : ""}
                    {d.trigger ? d.trigger : ""}
                    {d.changelogMatch === false ? " · not in changelog" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
