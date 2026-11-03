import Link from "next/link";
import { loadModel } from "@/lib/packet/load";
import { evaluateAlternative, combineScenarios } from "@/lib/change/scenario";
import { formatCents } from "@/lib/money";
import { SectionTitle } from "@/components/ui";

const ALT_IDS = ["equipment_section179", "equipment_no_bonus", "hvac_improvement", "standard_deduction", "penalty_annualized"];

export default async function WhatIfPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const sp = await searchParams;
  const model = loadModel();
  const selected = (sp.ids ?? "").split(",").filter(Boolean);
  const combined = selected.length ? combineScenarios(model, selected) : null;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">What-if sandbox</h1>
      <p className="text-sm text-slate-500">
        Scenarios never touch the workpaper. Packet alternatives give exact results; combining two sums them as an
        estimate. &quot;Promote&quot; turns a scenario into a Decision option or a proposed adjustment through the normal
        approval path.
      </p>

      <SectionTitle>Packet alternatives (exact)</SectionTitle>
      <div className="space-y-2">
        {ALT_IDS.map((id) => {
          const r = evaluateAlternative(model, id);
          if (!r) return null;
          const isSel = selected.includes(id);
          const nextIds = isSel ? selected.filter((x) => x !== id) : [...selected, id];
          return (
            <div key={id} className="card p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{id}</div>
                  <div className="text-sm text-slate-500">{r.label}</div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="mono">fed {formatCents(r.fedTaxChange)} · CA {formatCents(r.caTaxChange)}</span>
                  <Link href={`/what-if?ids=${nextIds.join(",")}`} className={`chip ${isSel ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>
                    {isSel ? "selected" : "add"}
                  </Link>
                </div>
              </div>
              {r.changedLines.length ? (
                <div className="mt-1 text-xs text-slate-400">changes: {r.changedLines.map((c) => c.key).join(", ")}</div>
              ) : null}
            </div>
          );
        })}
      </div>

      {combined ? (
        <section className="card p-4">
          <SectionTitle>Combined result</SectionTitle>
          <p className="text-sm">
            <span className="mono">fed {formatCents(combined.fedTaxChange)} · CA {formatCents(combined.caTaxChange)}</span>{" "}
            {combined.exact ? <span className="chip bg-emerald-100 text-emerald-800">exact</span> : <span className="chip bg-amber-100 text-amber-800">estimate</span>}
          </p>
          {combined.note ? <p className="mt-1 text-xs text-amber-700">{combined.note}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
