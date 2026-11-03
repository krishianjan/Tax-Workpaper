import Link from "next/link";
import { loadModel } from "@/lib/packet/load";
import { getSession } from "@/lib/session";
import { currentVersion } from "@/lib/evidence/disposition";
import { runChecks } from "@/lib/checks/runner";
import { groupIssues, returnAffecting } from "@/lib/issues/group";
import { loadAdjustments } from "@/lib/change/store";
import { formatCents } from "@/lib/money";
import { balanceFed, balanceCa } from "@/lib/effects";
import { SectionTitle, Stat } from "@/components/ui";

const KIND_STYLE: Record<string, string> = {
  return_error: "bg-red-100 text-red-800",
  extraction_error: "bg-red-100 text-red-800",
  judgment: "bg-violet-100 text-violet-800",
  compliance: "bg-sky-100 text-sky-800",
  scope: "bg-sky-100 text-sky-800",
  informational: "bg-slate-100 text-slate-600",
  arithmetic: "bg-slate-100 text-slate-600",
  completeness: "bg-amber-100 text-amber-800",
  prior_preparer_open_item: "bg-amber-100 text-amber-800",
};

export default async function IssuesPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const sp = await searchParams;
  const model = loadModel();
  const session = await getSession();
  const versionId = currentVersion(model, session.asOf)?.version ?? "v3";

  const issues = groupIssues(model, runChecks({ model, versionId }), versionId);
  const adjustments = await loadAdjustments();
  const adjByIssue = new Map<string, number>();
  for (const a of adjustments) if (a.issueId) adjByIssue.set(a.issueId, (adjByIssue.get(a.issueId) ?? 0) + 1);

  const shown = sp.kind ? issues.filter((i) => i.kind === sp.kind) : issues;
  const ra = returnAffecting(issues);
  const kinds = [...new Set(issues.map((i) => i.kind))];

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Issues</h1>
        <span className="text-sm text-slate-500">{issues.length} issues · {ra.length} return-affecting</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Return-affecting" value={ra.length} />
        <Stat label="Judgment calls" value={issues.filter((i) => i.kind === "judgment").length} />
        <Stat label="Proposed adjustments" value={adjustments.filter((a) => a.status !== "draft").length} />
        <Stat label="Total findings grouped" value={issues.reduce((n, i) => n + i.findingIds.length, 0)} />
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Link href="/issues" className="chip bg-slate-100 text-slate-700">all</Link>
        {kinds.map((k) => (
          <Link key={k} href={`/issues?kind=${k}`} className={`chip ${KIND_STYLE[k] ?? "bg-slate-100 text-slate-700"}`}>
            {k.replace(/_/g, " ")}
          </Link>
        ))}
      </div>

      <SectionTitle>Sorted by |materiality|</SectionTitle>
      <div className="space-y-2">
        {shown.map((i) => {
          const bFed = balanceFed(i.effects);
          const bCa = balanceCa(i.effects);
          return (
            <Link key={i.id} href={`/issues/${i.id}`} className="card block p-3 no-underline hover:bg-slate-50">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`chip ${KIND_STYLE[i.kind] ?? "bg-slate-100"}`}>{i.kind.replace(/_/g, " ")}</span>
                  <span className="font-medium text-slate-900">{i.title}</span>
                  <span className="chip bg-slate-100 text-slate-500">{i.area}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  {i.effects.taxFed !== 0n || i.effects.taxCa !== 0n ? (
                    <span className="mono">tax {formatCents(i.effects.taxFed)} / {formatCents(i.effects.taxCa)}</span>
                  ) : null}
                  {bFed !== 0n || bCa !== 0n ? (
                    <span className="mono text-slate-500">bal {formatCents(bFed)} / {formatCents(bCa)}</span>
                  ) : null}
                  <span className="text-xs text-slate-400">{i.findingIds.length} findings · {adjByIssue.get(i.id) ?? 0} adj</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
