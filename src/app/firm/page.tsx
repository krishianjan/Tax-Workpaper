import Link from "next/link";
import { loadModel } from "@/lib/packet/load";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { SectionTitle, Stat } from "@/components/ui";
import { buildDashboard, type EngagementInput } from "@/lib/firm/dashboard";
import { buildBudgetReport } from "@/lib/firm/budget";
import { loadTimeEntries } from "@/lib/firm/store";

const STATE_STYLE: Record<string, string> = {
  accepted: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  transmitted: "bg-sky-100 text-sky-800",
  held: "bg-amber-100 text-amber-800",
  in_preparation: "bg-slate-100 text-slate-600",
  not_started: "bg-slate-100 text-slate-500",
  ready: "bg-indigo-100 text-indigo-800",
};

export default async function FirmPage() {
  const model = loadModel();
  const session = await getSession();
  const asOf = session.asOf;

  // One real engagement from the packet, plus the 2026 rollforward placeholder.
  let filings: Array<{ jurisdiction: string; state: string }> = [];
  let openNotes = 0;
  let blockingQuestions = 0;
  let rollforwardExists = false;
  try {
    const fs = await prisma.filingStatus.findMany();
    filings = fs.map((f) => ({ jurisdiction: f.jurisdiction, state: f.state }));
    openNotes = await prisma.reviewNote.count({ where: { status: "open" } });
    blockingQuestions = await prisma.question.count({ where: { status: "open", blocksFiling: true } });
    rollforwardExists = (await prisma.snapshot.count({ where: { kind: "review_point" } })) > 0;
  } catch {
    /* no DB — show the clean, as-delivered state */
  }
  if (filings.length === 0) {
    filings = [
      { jurisdiction: "federal", state: "in_preparation" },
      { jurisdiction: "california", state: "in_preparation" },
    ];
  }

  const times = await loadTimeEntries();
  const budget = buildBudgetReport(model, times, asOf);
  const budgetPct = budget.totalBudgetMinutes > 0 ? (budget.totalActualMinutes / budget.totalBudgetMinutes) * 100 : 0;

  const assign = (model.raw.firm as Record<string, unknown>).assignment_at_start as Record<string, string>;
  const assignees = Object.entries(assign).map(([role, staffId]) => ({ role, staffId }));

  const deadlines = ((model.raw.firm as Record<string, unknown>).deadlines ?? []) as Array<{ what: string; date: string }>;
  const nextDeadline =
    deadlines
      .filter((d) => Date.parse(d.date) >= Date.parse(asOf))
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))[0] ?? null;

  const engagements: EngagementInput[] = [
    {
      id: "okafor-lindqvist-2025",
      client: "Okafor-Lindqvist (MFJ 2025)",
      taxYear: 2025,
      filings,
      nextDeadline,
      openBlockers: openNotes + blockingQuestions,
      budgetPct,
      assignees,
    },
  ];
  if (rollforwardExists) {
    engagements.push({
      id: "okafor-lindqvist-2026",
      client: "Okafor-Lindqvist (2026)",
      taxYear: 2026,
      filings: [],
      openBlockers: 0,
      budgetPct: 0,
      assignees: [],
      placeholder: true,
    });
  }

  const dash = buildDashboard(engagements);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Firm dashboard</h1>

      <form action="/search" className="flex gap-2 text-sm">
        <input
          name="q"
          placeholder="Search documents, lines, issues, decisions, notes, people…"
          className="w-full max-w-xl rounded border border-slate-300 px-3 py-1.5"
        />
        <button className="rounded bg-slate-900 px-3 py-1.5 text-white">Search</button>
      </form>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Engagements" value={dash.totals.engagements} />
        <Stat label="With open blockers" value={dash.totals.blocked} />
        <Stat label="Over budget" value={dash.totals.overBudget} />
      </div>

      <SectionTitle>Engagements (as of {asOf.slice(0, 10)})</SectionTitle>
      {dash.empty ? (
        <div className="card p-6 text-center text-slate-500">No engagements yet.</div>
      ) : (
        <div className="space-y-3">
          {dash.rows.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">{r.client}</div>
                <span className={`chip ${STATE_STYLE[r.overallState] ?? "bg-slate-100"}`}>{r.overallState.replace(/_/g, " ")}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {r.filings.length === 0 ? (
                  <span className="text-slate-400">Not started (rollforward)</span>
                ) : (
                  r.filings.map((f) => (
                    <span key={f.jurisdiction} className={`chip ${STATE_STYLE[f.state] ?? "bg-slate-100"}`}>
                      {f.jurisdiction}: {f.state.replace(/_/g, " ")}
                    </span>
                  ))
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-4">
                <div>Next: {r.nextDeadline ? `${r.nextDeadline.what.slice(0, 28)} (${r.nextDeadline.date})` : "—"}</div>
                <div>Blockers: {r.blocked ? <span className="text-red-700">{r.openBlockers}</span> : 0}</div>
                <div>Budget: <span className={r.overBudget ? "text-red-700" : ""}>{r.budgetPct.toFixed(0)}%</span></div>
                <div>Team: {r.assignees.map((a) => a.staffId).join(", ") || "—"}</div>
              </div>
              <div className="mt-2 flex gap-3 text-xs">
                <Link href="/firm/time">Time vs budget</Link>
                <Link href="/filing">Filing</Link>
                <Link href="/completeness">Readiness</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
