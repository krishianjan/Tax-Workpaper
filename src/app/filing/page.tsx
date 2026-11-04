import { loadModel } from "@/lib/packet/load";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { currentVersion, computeDispositions, dispositionSummary } from "@/lib/evidence/disposition";
import { loadAdjustments } from "@/lib/change/store";
import { loadDecisions } from "@/lib/judgment/store";
import { returnTotals } from "@/lib/change/effective";
import { runChecks } from "@/lib/checks/runner";
import { groupIssues } from "@/lib/issues/group";
import { computeSwings, unexplainedFlagged } from "@/lib/judgment/variance";
import { computeRequiredSteps, computeFilingGate } from "@/lib/filing/gate";
import { buildExtension, extensionVsFinal } from "@/lib/filing/extension";
import { reconcileTranscript } from "@/lib/filing/interest";
import { formatCents } from "@/lib/money";
import { openBlockingNotes, type ReviewNoteT } from "@/lib/people/reviewNotes";
import { SectionTitle, Stat } from "@/components/ui";
import { replaySeason, resetSeason } from "@/app/filing-actions";

export default async function FilingPage() {
  const model = loadModel();
  const session = await getSession();
  const versionId = currentVersion(model, session.asOf)?.version ?? "v3";
  const adjustments = await loadAdjustments(session.workspaceId);
  const decisions = await loadDecisions(session.workspaceId);
  const fin = returnTotals(model, versionId, "final", adjustments);

  const issues = groupIssues(model, runChecks({ model, versionId }), versionId);
  const explained = new Set(decisions.filter((d) => d.type === "variance_explanation").map((d) => d.issueId?.replace("variance:", "") ?? ""));
  const unexplained = unexplainedFlagged(computeSwings(model, versionId, adjustments), explained);
  const dsum = dispositionSummary(computeDispositions(model, session.asOf));

  let notes: ReviewNoteT[] = [];
  let reopened = 0, stale = 0, sigCount = 0;
  let subs: Array<{ id: string; jurisdiction: string; status: string; snapshotHash: string; at: Date; errors: unknown }> = [];
  let filing: Array<{ jurisdiction: string; state: string }> = [];
  let conflicts: Array<{ eventId: string; scripted: string; finalState: string; resolution: string; note: string }> = [];
  try {
    const ws = session.workspaceId;
    notes = (await prisma.reviewNote.findMany({ where: { workspaceId: ws } })) as unknown as ReviewNoteT[];
    reopened = await prisma.signOff.count({ where: { status: "reopened", workspaceId: ws } });
    stale = await prisma.adjustment.count({ where: { status: "stale", workspaceId: ws } });
    sigCount = await prisma.signOff.count({ where: { scope: "form8879", status: "valid", workspaceId: ws } });
    subs = await prisma.submission.findMany({ where: { workspaceId: ws }, orderBy: { at: "asc" } });
    filing = await prisma.filingStatus.findMany({ where: { workspaceId: ws } });
    conflicts = await prisma.replayConflict.findMany({ where: { workspaceId: ws } });
  } catch {
    /* ignore */
  }

  const steps = computeRequiredSteps({
    engagementSigned: true,
    identityVerified: Boolean(await prisma.factCorrection.findFirst({ where: { extractedValueId: "household:theo:ssn", workspaceId: session.workspaceId } }).catch(() => null)),
    priorYearReviewed: true,
    documentsAccounted: dsum.accounted === dsum.total,
    variancesExplained: unexplained.length === 0,
    carryoversAgreed: true,
    paymentsAgreed: adjustments.some((a) => a.status === "approved" && a.rateCategory === "payment"),
    dueDiligenceComplete: false,
    diagnosticsResolved: false,
    reviewerSignedOff: Boolean(await prisma.signOff.findFirst({ where: { level: "reviewer", scope: "return", status: "valid", workspaceId: session.workspaceId } }).catch(() => null)),
    partnerSignedOff: Boolean(await prisma.signOff.findFirst({ where: { level: "partner", scope: "return", status: "valid", workspaceId: session.workspaceId } }).catch(() => null)),
    clientApproved: sigCount >= 2,
  });
  const gate = computeFilingGate({
    requiredSteps: steps, openBlockingNotes: openBlockingNotes(notes).length, openBlockingQuestions: 0,
    reopenedSignoffs: reopened, completenessGreen: false, staleAdjustments: stale, unapprovedJudgmentIssues: issues.filter((i) => i.kind === "judgment").length, bothSpousesSigned: sigCount >= 2,
  });

  const ext = buildExtension(model);
  const extVf = ext ? extensionVsFinal(ext, fin.balanceFed) : null;
  const recon = reconcileTranscript({ finalTotalTaxCents: fin.taxFed, finalBalanceCents: fin.balanceFed, computedInterest: 0n, computedFtp: 0n });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Filing</h1>
        <div className="flex gap-2">
          <form action={replaySeason}><button className="rounded bg-slate-900 px-3 py-1 text-sm text-white">Replay season to {session.asOf.slice(0, 10)}</button></form>
          <form action={resetSeason}><button className="rounded border border-slate-300 px-3 py-1 text-sm">Reset</button></form>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className={`chip ${gate.green ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>filing gate: {gate.green ? "GREEN" : "RED"}</span>
        {filing.map((f) => <span key={f.jurisdiction} className="chip bg-slate-100 text-slate-700">{f.jurisdiction}: {f.state}</span>)}
      </div>

      {!gate.green ? (
        <div className="card border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <div className="font-semibold">Blockers ({gate.blockers.length})</div>
          <ul className="mt-1 list-disc pl-5">{gate.blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>
        </div>
      ) : null}

      <SectionTitle>12 required steps</SectionTitle>
      <ul className="grid gap-1 text-sm md:grid-cols-2">
        {steps.map((s) => (
          <li key={s.name} className="card p-2">
            <span className={`chip ${s.done ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{s.done ? "done" : "open"}</span> {s.name}
          </li>
        ))}
      </ul>

      <SectionTitle>Extension</SectionTitle>
      {ext ? (
        <div className="card p-3 text-sm">
          {ext.form}, filed by {ext.filedBy} on {ext.basisVersion}: estimated {formatCents(ext.estimatedBalanceCents)}, paid {formatCents(ext.paidCents)} ({ext.roundingRule}).
          <div className="mt-1 text-slate-600">{ext.note}</div>
          {extVf ? <div className="mt-1 font-medium">{extVf.explanation}</div> : null}
        </div>
      ) : null}

      <SectionTitle>Submissions (immutable)</SectionTitle>
      {subs.length === 0 ? <p className="text-sm text-slate-500">None yet — click &quot;Replay season&quot; (set the header date to 2026-07-13+).</p> : null}
      <div className="space-y-1">
        {subs.map((s) => (
          <div key={s.id} className="card p-2 text-sm">
            <span className={`chip ${s.status === "accepted" ? "bg-emerald-100 text-emerald-800" : s.status === "rejected" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-600"}`}>{s.status}</span>
            <span className="mono"> {s.jurisdiction} · {s.id}</span> <span className="text-xs text-slate-400">{s.at.toISOString().slice(0, 16).replace("T", " ")} · snap {s.snapshotHash.slice(0, 8)}</span>
            {Array.isArray(s.errors) && s.errors.length ? <div className="text-xs text-red-700">{(s.errors as Array<{ code: string; message: string }>).map((e) => `${e.code}: ${e.message}`).join("; ")}</div> : null}
          </div>
        ))}
      </div>

      <SectionTitle>After filing — transcript reconciliation</SectionTitle>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Code</th><th className="px-3 py-2">Our expected</th><th className="px-3 py-2">Transcript</th><th className="px-3 py-2">Agrees</th></tr></thead>
          <tbody>
            {recon.map((r) => (
              <tr key={r.field} className="border-t border-slate-100">
                <td className="px-3 py-2">{r.field}</td><td className="px-3 py-2 mono">{r.expected}</td><td className="px-3 py-2 text-slate-500">{r.transcript}</td>
                <td className="px-3 py-2">{r.agrees ? <span className="chip bg-emerald-100 text-emerald-800">yes</span> : <span className="chip bg-amber-100 text-amber-800">conflict</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {conflicts.map((c) => (
        <div key={c.eventId} className="card border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <span className="chip bg-amber-100 text-amber-800">replay conflict {c.eventId}</span> {c.note}
        </div>
      ))}
    </div>
  );
}
