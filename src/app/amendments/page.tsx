import { prisma } from "@/lib/db";
import { SectionTitle } from "@/components/ui";
import { openAmendment } from "@/app/filing-actions";

export default async function AmendmentsPage() {
  let filed: Array<{ label: string; contentHash: string }> = [];
  let cases: Array<{ id: string; jurisdiction: string; reason: string; baseSnapshotHash: string; openedBy: string; status: string }> = [];
  try {
    filed = await prisma.snapshot.findMany({ where: { kind: "filed" }, select: { label: true, contentHash: true } });
    cases = await prisma.amendmentCase.findMany({ orderBy: { createdAt: "desc" } });
  } catch {
    /* ignore */
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Amendments</h1>
      <p className="text-sm text-slate-500">
        The filed snapshot is the base forever and is never mutated. An amendment is a new case (1040-X / 540NR-X style
        delta) with its own adjustments, decisions, sign-offs, gate and client signature.
      </p>

      <SectionTitle>Filed snapshots (immutable base)</SectionTitle>
      {filed.length === 0 ? <p className="text-sm text-slate-500">Nothing filed yet. Freeze a jurisdiction from /filing first.</p> : null}
      <ul className="space-y-1 text-sm">
        {filed.map((f) => <li key={f.label} className="card p-2"><span className="mono">{f.label}</span> — hash <span className="mono">{f.contentHash}</span></li>)}
      </ul>

      <SectionTitle>Amendment cases</SectionTitle>
      <div className="space-y-2">
        {cases.map((c) => (
          <div key={c.id} className="card p-3 text-sm">
            <span className="chip bg-slate-100 text-slate-600">{c.status}</span> <span className="mono">{c.jurisdiction}</span> — {c.reason}
            <div className="text-xs text-slate-400">opened by {c.openedBy} · base {c.baseSnapshotHash}</div>
          </div>
        ))}
      </div>

      {filed.length ? (
        <form action={openAmendment} className="flex flex-wrap items-end gap-2 text-sm">
          <select name="jurisdiction" className="rounded border border-slate-300 px-2 py-1">{filed.map((f) => <option key={f.label} value={f.label.replace("filed-", "")}>{f.label.replace("filed-", "")}</option>)}</select>
          <input name="reason" placeholder="reason (e.g. C6 bank statement arrived)" className="flex-1 rounded border border-slate-300 px-2 py-1" />
          <button className="rounded bg-slate-900 px-3 py-1 text-white">Open amendment</button>
        </form>
      ) : null}
    </div>
  );
}
