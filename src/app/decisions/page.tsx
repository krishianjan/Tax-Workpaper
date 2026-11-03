import Link from "next/link";
import { loadModel } from "@/lib/packet/load";
import { decisionTemplates } from "@/lib/judgment/templates";
import { loadDecisions } from "@/lib/judgment/store";
import { formatCents } from "@/lib/money";
import { SectionTitle } from "@/components/ui";
import { createDecision } from "@/app/judgment-actions";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  proposed: "bg-sky-100 text-sky-800",
  reviewed: "bg-indigo-100 text-indigo-800",
  approved: "bg-emerald-100 text-emerald-800",
  reopened: "bg-amber-100 text-amber-800",
  superseded: "bg-slate-200 text-slate-700",
};

export default async function DecisionsPage() {
  const model = loadModel();
  const templates = decisionTemplates(model);
  const decisions = await loadDecisions();
  const usedKeys = new Set(decisions.map((d) => d.issueId));

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Decisions</h1>
      <p className="text-sm text-slate-500">
        Software offers options with effects, evidence and authority; the CPA decides. A flag is never a decision — nothing
        is applied to the final until a decision is approved.
      </p>

      <SectionTitle>Recorded decisions ({decisions.length})</SectionTitle>
      <div className="space-y-2">
        {decisions.length === 0 ? <p className="text-sm text-slate-500">None yet. Create one from an offered template below.</p> : null}
        {decisions.map((d) => {
          const sel = d.options.find((o) => o.id === d.selectedOptionId);
          return (
            <Link key={d.id} href={`/decisions/${d.id}`} className="card block p-3 no-underline hover:bg-slate-50">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`chip ${STATUS_STYLE[d.status]}`}>{d.status}</span>
                  <span className="chip bg-slate-100 text-slate-500">{d.type.replace(/_/g, " ")}</span>
                  <span className="font-medium">{d.question}</span>
                </div>
                {sel ? <span className="mono text-sm">{sel.label}: {formatCents(sel.taxEffectFed)}/{formatCents(sel.taxEffectCa)}</span> : null}
              </div>
            </Link>
          );
        })}
      </div>

      <SectionTitle>Offered (not yet decided)</SectionTitle>
      <div className="space-y-3">
        {templates.filter((t) => !usedKeys.has(t.issueHint)).map((t) => (
          <div key={t.key} className="card p-3">
            <div className="flex items-center gap-2">
              <span className="chip bg-slate-100 text-slate-500">{t.type.replace(/_/g, " ")}</span>
              <span className="font-medium">{t.question}</span>
              {t.missingEvidence ? <span className="chip bg-amber-100 text-amber-800">evidence incomplete</span> : null}
              {t.irrevocable ? <span className="chip bg-red-100 text-red-800">irrevocable</span> : null}
            </div>
            <p className="mt-1 text-sm text-slate-600">{t.facts}</p>
            <p className="text-xs text-slate-400">authority: {t.authority} · evidence: {t.evidenceIds.join(", ")}{t.formWhereMade ? ` · form: ${t.formWhereMade}` : ""}</p>
            <ul className="mt-1 text-sm">
              {t.options.map((o) => (
                <li key={o.id} className="mono">{o.id}: {o.label} — {formatCents(o.taxEffectFed)}/{formatCents(o.taxEffectCa)} <span className="text-slate-400">({o.method})</span></li>
              ))}
            </ul>
            <form action={createDecision} className="mt-2 flex flex-wrap items-end gap-2 text-sm">
              <input type="hidden" name="templateKey" value={t.key} />
              <input type="hidden" name="issueId" value={t.issueHint} />
              <input type="hidden" name="question" value={t.question} />
              <input type="hidden" name="type" value={t.type} />
              <input type="hidden" name="authority" value={t.authority} />
              <input type="hidden" name="evidenceIds" value={t.evidenceIds.join(",")} />
              <input type="hidden" name="watchedLineKeys" value={t.watchedLineKeys.join(",")} />
              <label className="flex flex-col">select option
                <select name="selectedOptionId" className="rounded border border-slate-300 px-2 py-1">
                  {t.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col">position strength
                <select name="positionStrength" className="rounded border border-slate-300 px-2 py-1">
                  <option value="substantial_authority">substantial authority</option>
                  <option value="reasonable_basis_disclosed_8275">reasonable basis (8275)</option>
                  <option value="not_applicable">n/a</option>
                </select>
              </label>
              <button className="rounded bg-slate-900 px-3 py-1 text-white">Create &amp; propose</button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
