import { notFound } from "next/navigation";
import { loadDecision } from "@/lib/judgment/store";
import { validateDecision } from "@/lib/judgment/decision";
import { formatCents } from "@/lib/money";
import { SectionTitle } from "@/components/ui";
import { transitionDecision, attachDecisionEvidence, acceptWeakEvidence } from "@/app/judgment-actions";

export default async function DecisionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await loadDecision(id);
  if (!d) notFound();
  const v = validateDecision(d);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <span className="chip bg-slate-100 text-slate-600">{d.status}</span>
          <span className="chip bg-slate-100 text-slate-500">{d.type.replace(/_/g, " ")}</span>
          <span className="mono text-xs text-slate-300">rev {d.revision}</span>
        </div>
        <h1 className="mt-1 text-xl font-semibold">{d.question}</h1>
        {d.facts ? <p className="text-sm text-slate-600">{d.facts}</p> : null}
        <p className="text-xs text-slate-400">
          authority: {d.authority} · position: {d.positionStrength} · evidence: {d.evidenceIds.join(", ")} ·
          watches: {d.watchedLineKeys.join(", ")} · prepared {d.preparedBy ?? "—"} / reviewed {d.reviewedBy ?? "—"} / approved {d.approvedBy ?? "—"}
        </p>
        {!v.ok ? <p className="mt-1 text-sm text-red-700">Invalid: {v.errors.join(" ")}</p> : null}
      </div>

      <section>
        <SectionTitle>Options</SectionTitle>
        <ul className="space-y-1 text-sm">
          {d.options.map((o) => (
            <li key={o.id} className={`card p-2 ${d.selectedOptionId === o.id ? "border-sky-400 bg-sky-50" : ""}`}>
              <span className="mono font-medium">{o.id}</span> {o.label} — {o.consequence}{" "}
              <span className="mono">{formatCents(o.taxEffectFed)}/{formatCents(o.taxEffectCa)}</span>{" "}
              <span className="chip bg-slate-100 text-slate-500">{o.method}</span>
              {d.selectedOptionId === o.id ? <span className="chip bg-sky-100 text-sky-800">selected</span> : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-wrap gap-2">
        {(["review", "approve", "reopen", "supersede"] as const).map((action) => (
          <form key={action} action={transitionDecision}>
            <input type="hidden" name="id" value={d.id} />
            <input type="hidden" name="action" value={action} />
            {d.selectedOptionId ? <input type="hidden" name="selectedOptionId" value={d.selectedOptionId} /> : null}
            <button className="rounded border border-slate-300 px-3 py-1 text-sm">{action}</button>
          </form>
        ))}
        {!d.weakEvidenceAccepted ? (
          <form action={acceptWeakEvidence}>
            <input type="hidden" name="id" value={d.id} />
            <button className="rounded border border-amber-300 px-3 py-1 text-sm text-amber-800">accept weaker evidence</button>
          </form>
        ) : null}
      </section>

      <section className="card p-4">
        <SectionTitle>Attach evidence (may reopen if approved)</SectionTitle>
        <form action={attachDecisionEvidence} className="flex gap-2 text-sm">
          <input type="hidden" name="id" value={d.id} />
          <input name="evidenceId" placeholder="D## / ev-#### / attachment id" className="flex-1 rounded border border-slate-300 px-2 py-1" required />
          <button className="rounded bg-slate-900 px-3 py-1 text-white">Attach</button>
        </form>
        <p className="mt-1 text-xs text-slate-400">
          dependency hash: <span className="mono">{d.dependencyHash ?? "—"}</span>. If this changes while approved, the
          decision reopens and adjustments created from it go stale.
        </p>
      </section>
    </div>
  );
}
