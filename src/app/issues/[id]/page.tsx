import { notFound } from "next/navigation";
import { loadModel } from "@/lib/packet/load";
import { getSession } from "@/lib/session";
import { currentVersion } from "@/lib/evidence/disposition";
import { runChecks } from "@/lib/checks/runner";
import { groupIssues } from "@/lib/issues/group";
import { loadAdjustmentsByIssue, isFrozen } from "@/lib/change/store";
import { requiresPartner, thresholdCents } from "@/lib/change/approval";
import { formatCents } from "@/lib/money";
import { FindingCard } from "@/components/Finding";
import { SectionTitle } from "@/components/ui";
import { proposeAdjustment, transitionAdjustment } from "@/app/change-actions";
import type { CheckResult } from "@/lib/checks/types";

const ADJ_STYLE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  proposed: "bg-sky-100 text-sky-800",
  reviewed: "bg-indigo-100 text-indigo-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  reverted: "bg-amber-100 text-amber-800",
  stale: "bg-amber-100 text-amber-800",
  absorbed: "bg-slate-200 text-slate-700",
};

export default async function IssueDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const model = loadModel();
  const session = await getSession();
  const versionId = currentVersion(model, session.asOf)?.version ?? "v3";

  const findings = runChecks({ model, versionId });
  const issue = groupIssues(model, findings, versionId).find((i) => i.id === id);
  if (!issue) notFound();

  const findingById = new Map<string, CheckResult>(findings.map((f) => [f.id, f]));
  const issueFindings = issue.findingIds.map((fid) => findingById.get(fid)).filter((f): f is CheckResult => Boolean(f));
  const adjustments = await loadAdjustmentsByIssue(id);
  const frozen = await isFrozen();
  const T = thresholdCents(model);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <span className="chip bg-slate-100 text-slate-600">{issue.kind.replace(/_/g, " ")}</span>
          <span className="chip bg-sky-100 text-sky-800">{issue.area}</span>
          <span className="mono text-xs text-slate-300">#{issue.id}</span>
        </div>
        <h1 className="mt-1 text-xl font-semibold">{issue.title}</h1>
        <p className="text-sm text-slate-500">
          tax {formatCents(issue.effects.taxFed)} fed / {formatCents(issue.effects.taxCa)} CA ·
          payments {formatCents(issue.effects.payFed)} / {formatCents(issue.effects.payCa)}
          {frozen ? " · FROZEN (filed)" : ""}
        </p>
      </div>

      <section>
        <SectionTitle>Findings ({issueFindings.length})</SectionTitle>
        <div className="space-y-3">
          {issueFindings.map((r) => (
            <FindingCard key={r.id} r={r} model={model} versionId={versionId} />
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>Adjustments ({adjustments.length})</SectionTitle>
        <div className="space-y-3">
          {adjustments.map((a) => {
            const needsPartner = requiresPartner(a.effects, T);
            return (
              <div key={a.id} className="card p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`chip ${ADJ_STYLE[a.status] ?? "bg-slate-100"}`}>{a.status}</span>
                  {needsPartner ? <span className="chip bg-amber-100 text-amber-800">partner sign-off</span> : null}
                  <span className="mono text-xs">{a.primaryLineKey}</span>
                  <span className="mono text-sm">tax {formatCents(a.effects.taxFed)}/{formatCents(a.effects.taxCa)} · pay {formatCents(a.effects.payFed)}/{formatCents(a.effects.payCa)}</span>
                  <span className="chip bg-slate-100 text-slate-500">{a.method}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{a.reason}</p>
                <p className="text-xs text-slate-400">
                  prepared {a.preparedBy ?? "—"} · reviewed {a.reviewedBy ?? "—"} · approved {a.approvedBy ?? "—"} · evidence {a.evidenceIds.join(", ")}
                </p>
                {!frozen && a.status !== "approved" && a.status !== "rejected" ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(["review", "approve", "reject"] as const).map((action) => (
                      <form key={action} action={transitionAdjustment}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="action" value={action} />
                        <input type="hidden" name="expectedVersion" value={a.version} />
                        <button className="rounded border border-slate-300 px-2 py-0.5 text-xs">{action}</button>
                      </form>
                    ))}
                  </div>
                ) : null}
                {a.status === "approved" ? (
                  <form action={transitionAdjustment} className="mt-2">
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="action" value="revert" />
                    <input type="hidden" name="expectedVersion" value={a.version} />
                    <button className="rounded border border-amber-300 px-2 py-0.5 text-xs text-amber-800">reopen (approver only)</button>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {!frozen ? (
        <section className="card p-4">
          <SectionTitle>Propose an adjustment</SectionTitle>
          <form action={proposeAdjustment} className="grid gap-2 text-sm md:grid-cols-2">
            <input type="hidden" name="issueId" value={issue.id} />
            <input type="hidden" name="baseVersionId" value={versionId} />
            <label className="flex flex-col">Primary line key
              <input name="primaryLineKey" defaultValue={issue.refs.find((r) => r.includes(".")) ?? ""} className="rounded border border-slate-300 px-2 py-1" required />
            </label>
            <label className="flex flex-col">Kind
              <select name="kind" className="rounded border border-slate-300 px-2 py-1">
                <option value="tax">tax</option>
                <option value="payment">payment</option>
              </select>
            </label>
            <label className="flex flex-col">Rate category (tax)
              <input name="rateCategory" placeholder="schc_profit, stcg, ltcg, itemized…" className="rounded border border-slate-300 px-2 py-1" />
            </label>
            <label className="flex items-center gap-2">CA-source<input type="checkbox" name="caSourceFlag" value="true" /></label>
            <label className="flex flex-col">Base Δ (cents, signed to taxable base)
              <input name="baseDeltaCents" type="number" defaultValue="0" className="rounded border border-slate-300 px-2 py-1" />
            </label>
            <label className="flex flex-col">Payment Δ fed / CA (cents)
              <div className="flex gap-1">
                <input name="payFedCents" type="number" defaultValue="0" className="w-1/2 rounded border border-slate-300 px-2 py-1" />
                <input name="payCaCents" type="number" defaultValue="0" className="w-1/2 rounded border border-slate-300 px-2 py-1" />
              </div>
            </label>
            <label className="flex flex-col md:col-span-2">Targets (JSON array of {"{kind,key,baseValue,newValue}"})
              <input name="targets" defaultValue='[{"kind":"line","key":"","baseValue":0,"newValue":0}]' className="rounded border border-slate-300 px-2 py-1 font-mono" />
            </label>
            <label className="flex flex-col md:col-span-2">Reason (≥ 15 chars)
              <input name="reason" className="rounded border border-slate-300 px-2 py-1" required minLength={15} />
            </label>
            <label className="flex flex-col md:col-span-2">Evidence ids (≥ 1, comma-separated)
              <input name="evidenceIds" className="rounded border border-slate-300 px-2 py-1" required />
            </label>
            <div className="md:col-span-2">
              <button className="rounded bg-slate-900 px-3 py-1 text-white">Propose</button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
