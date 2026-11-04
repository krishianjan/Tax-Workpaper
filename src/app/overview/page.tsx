import Link from "next/link";
import { loadModel } from "@/lib/packet/load";
import { getSession } from "@/lib/session";
import { verifyAll, verificationSummary } from "@/lib/evidence/verify";
import { computeDispositions, dispositionSummary, currentVersion } from "@/lib/evidence/disposition";
import { computeDocumentLinks } from "@/lib/evidence/links";
import { runChecks, sortByImpact, previewTotals } from "@/lib/checks/runner";
import { formatDollars, formatCents } from "@/lib/money";
import { Stat, SectionTitle, VerificationBadge, DispositionChip } from "@/components/ui";
import { Term } from "@/components/Term";
import type { VerificationStatus } from "@/lib/evidence/verify";
import type { DispositionStatus } from "@/lib/evidence/disposition";
import { groupIssues, returnAffecting } from "@/lib/issues/group";
import { loadBadgeCounts } from "@/lib/navBadges";
import { computeNextActions } from "@/lib/nextActions";
import type { Actor } from "@/lib/people/permissions";

function dollarsFromSummary(summary: unknown, path: string[]): string {
  let cur: unknown = summary;
  for (const p of path) {
    if (cur && typeof cur === "object" && p in cur) cur = (cur as Record<string, unknown>)[p];
    else return "—";
  }
  return typeof cur === "number" ? formatDollars(BigInt(Math.round(cur * 100))) : "—";
}

export default async function OverviewPage() {
  const model = loadModel();
  const session = await getSession();
  const cur = currentVersion(model, session.asOf);

  const verifications = verifyAll(model);
  const vsum = verificationSummary(verifications);
  const disp = computeDispositions(model, session.asOf);
  const dsum = dispositionSummary(disp);
  const links = computeDocumentLinks(model);

  const findings = sortByImpact(runChecks({ model, versionId: cur?.version ?? "v3" }));
  const preview = previewTotals(findings);
  const failingByArea = new Map<string, number>();
  for (const f of findings) {
    if (f.status === "fail" || f.status === "warn") failingByArea.set(f.area, (failingByArea.get(f.area) ?? 0) + 1);
  }

  const needsAttention = vsum.mismatch_with_source + vsum.needs_human + vsum.not_printed;

  const actor: Actor = {
    id: session.staff.id,
    role: session.staff.role as Actor["role"],
    clearance: session.cleared,
    activeFrom: "2000-01-01",
  };
  const badges = await loadBadgeCounts(actor);
  const openIssues = returnAffecting(groupIssues(model, findings, cur?.version ?? "v3")).length;
  const recomputeResidual = findings.some((f) => f.checkId === "TAX_COMPUTATION_RECOMPUTE" && f.status === "warn");
  const nextActions = computeNextActions({
    openIssues,
    needsAttention,
    reviewOpen: badges.review,
    questionsOpen: badges.questions,
    decisionsPending: badges.decisions,
    recomputeResidual,
    clientApprovalPending: true,
  });

  const toneStyle: Record<string, string> = {
    red: "border-l-red-400",
    amber: "border-l-amber-400",
    slate: "border-l-slate-300",
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">{model.raw.packet.name}</h1>
        <p className="text-sm text-slate-500">
          Current return: {cur?.version} · computed {cur?.computed_at?.slice(0, 10)} · as of {session.asOf.slice(0, 10)} ·
          acting as {session.staff.id} ({session.staff.role})
        </p>
      </div>

      <section>
        <SectionTitle>Next actions</SectionTitle>
        {nextActions.length === 0 ? (
          <div className="card p-4 text-sm text-emerald-700">Nothing blocking — the return is ready for the next sign-off.</div>
        ) : (
          <ul className="space-y-2">
            {nextActions.map((a) => (
              <li key={a.href + a.label}>
                <Link
                  href={a.href}
                  className={`flex items-center justify-between rounded-lg border border-l-4 border-slate-200 bg-white px-4 py-2 text-sm no-underline shadow-sm hover:border-slate-300 ${toneStyle[a.tone]}`}
                >
                  <span className="text-slate-800">{a.label}</span>
                  {a.count ? <span className="chip bg-slate-100 text-slate-700">{a.count}</span> : <span aria-hidden className="text-slate-400">→</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle>Return totals (federal)</SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={<Term term="AGI">AGI</Term>} value={dollarsFromSummary(cur?.summary, ["federal", "agi"])} />
          <Stat label="Taxable income" value={dollarsFromSummary(cur?.summary, ["federal", "taxable_income"])} />
          <Stat label="Total tax" value={dollarsFromSummary(cur?.summary, ["federal", "total_tax"])} />
          <Stat label="Balance due" value={dollarsFromSummary(cur?.summary, ["federal", "balance_due"])} />
        </div>
      </section>

      <section>
        <SectionTitle>Evidence health</SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            label="Documents accounted"
            value={`${dsum.accounted}/${dsum.total}`}
            sub={dsum.accounted === dsum.total ? "Complete" : "Gaps remain"}
          />
          <Stat label="Values verified vs source" value={vsum.agreed_to_source.toLocaleString()} sub="auto-agreed to printed content" />
          <Stat label="Need attention" value={needsAttention.toLocaleString()} sub="mismatch · not printed · low confidence" />
          <Stat label="Document links" value={links.length} sub="duplicates, corrections, same issuer" />
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="card p-4">
          <SectionTitle>Verification breakdown</SectionTitle>
          <ul className="space-y-2 text-sm">
            {(Object.keys(vsum) as VerificationStatus[]).map((k) => (
              <li key={k} className="flex items-center justify-between">
                <VerificationBadge status={k} />
                <span className="tabular-nums">{vsum[k].toLocaleString()}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            Ground truth is each page&apos;s printed content — not the pipeline&apos;s confidence. A 0.97 read can still be
            wrong (D62 EIN).
          </p>
        </div>

        <div className="card p-4">
          <SectionTitle>Document disposition</SectionTitle>
          <ul className="space-y-2 text-sm">
            {Object.entries(dsum.byStatus).map(([k, n]) => (
              <li key={k} className="flex items-center justify-between">
                <DispositionChip status={k as DispositionStatus} />
                <span className="tabular-nums">{n}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            <Link href="/documents">Open the document index →</Link>
          </p>
        </div>
      </section>

      <section>
        <SectionTitle>Workpaper preview (v3 + failing checks, not yet approved)</SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Preview Δ tax (fed)" value={formatCents(preview.taxFed)} sub={`${preview.failingCount} failing checks`} />
          <Stat label="Preview Δ balance (fed)" value={formatCents(preview.balanceFed)} sub="tax − payments" />
          <Stat label="Preview Δ balance (CA)" value={formatCents(preview.balanceCa)} />
          <Stat label="Findings" value={findings.length} sub={<Link href="/issues">open issues →</Link>} />
        </div>
      </section>

      <section className="card p-4">
        <SectionTitle>Failing checks by area</SectionTitle>
        <div className="flex flex-wrap gap-2 text-sm">
          {[...failingByArea.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([area, n]) => (
              <Link key={area} href={`/checks?area=${encodeURIComponent(area)}`} className="chip bg-amber-100 text-amber-800">
                {area}: {n}
              </Link>
            ))}
        </div>
      </section>
    </div>
  );
}
