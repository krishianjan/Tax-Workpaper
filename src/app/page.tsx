import Link from "next/link";
import { loadModel } from "@/lib/packet/load";
import { getSession } from "@/lib/session";
import { verifyAll, verificationSummary } from "@/lib/evidence/verify";
import { computeDispositions, dispositionSummary, currentVersion } from "@/lib/evidence/disposition";
import { computeDocumentLinks } from "@/lib/evidence/links";
import { formatDollars } from "@/lib/money";
import { Stat, SectionTitle, VerificationBadge, DispositionChip } from "@/components/ui";
import type { VerificationStatus } from "@/lib/evidence/verify";
import type { DispositionStatus } from "@/lib/evidence/disposition";

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

  const needsAttention = vsum.mismatch_with_source + vsum.needs_human + vsum.not_printed;

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
        <SectionTitle>Return totals (federal)</SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="AGI" value={dollarsFromSummary(cur?.summary, ["federal", "agi"])} />
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

      <section className="card p-4">
        <SectionTitle>Block 2 preview</SectionTitle>
        <p className="text-sm text-slate-600">
          Independent checks (books-to-tax, 8949 reconciliation, payments vs agency, state split, prior-year variance) and
          the tax-effect preview land in the next block. The schema, event log and evidence links here already support
          them.
        </p>
      </section>
    </div>
  );
}
