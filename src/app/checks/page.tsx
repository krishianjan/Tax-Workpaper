import Link from "next/link";
import { loadModel } from "@/lib/packet/load";
import { getSession } from "@/lib/session";
import { currentVersion } from "@/lib/evidence/disposition";
import { runChecks, sortByImpact, previewTotals } from "@/lib/checks/runner";
import { formatCents } from "@/lib/money";
import { FindingCard } from "@/components/Finding";
import { SectionTitle, Stat } from "@/components/ui";
import type { CheckStatus } from "@/lib/checks/types";

export default async function ChecksPage({ searchParams }: { searchParams: Promise<{ status?: string; area?: string }> }) {
  const sp = await searchParams;
  const model = loadModel();
  const session = await getSession();
  const versionId = currentVersion(model, session.asOf)?.version ?? "v3";

  let findings = sortByImpact(runChecks({ model, versionId }));
  const preview = previewTotals(findings);

  const counts: Record<CheckStatus, number> = { fail: 0, warn: 0, info: 0, pass: 0 };
  for (const f of findings) counts[f.status] += 1;
  const areas = [...new Set(findings.map((f) => f.area))].sort();

  if (sp.status) findings = findings.filter((f) => f.status === sp.status);
  if (sp.area) findings = findings.filter((f) => f.area === sp.area);

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Checks that don&apos;t trust the engine</h1>
        <span className="text-sm text-slate-500">version {versionId}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Failing (auto-applied)" value={preview.failingCount} />
        <Stat label="Preview Δ tax (fed)" value={formatCents(preview.taxEffectFed)} sub="v3 + Σ failing checks" />
        <Stat label="Preview Δ tax (CA)" value={formatCents(preview.taxEffectCa)} />
        <Stat label="Total findings" value={findings.length} />
      </div>

      <p className="rounded bg-slate-100 p-2 text-sm text-slate-600">
        Workpaper preview = {versionId} + Σ effects of failing checks (not yet approved). Judgment items are listed but not
        added. Approval and sign-off arrive in Block 2 (People).
      </p>

      <div className="flex flex-wrap gap-2 text-xs">
        <Link href="/checks" className="chip bg-slate-100 text-slate-700">
          all ({Object.values(counts).reduce((a, b) => a + b, 0)})
        </Link>
        {(["fail", "warn", "info"] as CheckStatus[]).map((s) => (
          <Link key={s} href={`/checks?status=${s}`} className="chip bg-slate-100 text-slate-700">
            {s} ({counts[s]})
          </Link>
        ))}
        {areas.map((a) => (
          <Link key={a} href={`/checks?area=${encodeURIComponent(a)}`} className="chip bg-sky-50 text-sky-800">
            {a}
          </Link>
        ))}
      </div>

      <SectionTitle>Findings (sorted by |tax effect|)</SectionTitle>
      <div className="space-y-3">
        {findings.map((r) => (
          <FindingCard key={r.id} r={r} model={model} versionId={versionId} />
        ))}
      </div>
    </div>
  );
}
