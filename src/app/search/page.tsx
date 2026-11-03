import Link from "next/link";
import { loadModel } from "@/lib/packet/load";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { SectionTitle } from "@/components/ui";
import { buildPacketIndex, search, type SearchDoc } from "@/lib/firm/search";
import { isSensitiveQuery } from "@/lib/firm/sensitive";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const model = loadModel();
  const session = await getSession();
  const cleared = session.cleared;
  const isStaff = session.staff.role !== "client";

  const index: SearchDoc[] = buildPacketIndex(model);

  // Workpaper entities from the DB (issues, decisions, notes, questions, notices).
  try {
    const [issues, decisions, notices] = await Promise.all([
      prisma.issue.findMany({ take: 200 }),
      prisma.decision.findMany({ take: 200 }),
      prisma.notice.findMany({ take: 50 }),
    ]);
    for (const i of issues) index.push({ kind: "issue", id: i.id, title: i.title, body: `${i.area} ${i.kind}`, href: `/issues/${i.id}`, staffOnly: true });
    for (const d of decisions) index.push({ kind: "decision", id: d.id, title: d.question, body: d.facts ?? "", href: `/decisions/${d.id}`, staffOnly: true });
    for (const n of notices) index.push({ kind: "notice", id: n.id, title: `${n.id} ${n.type}`, body: n.agency, href: `/notices/${n.id}` });
  } catch {
    /* no DB — packet index only */
  }

  const results = q ? search(index, q, { cleared, isStaff }) : [];
  const sensitiveRefused = q.length > 0 && !cleared && isSensitiveQuery(q);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Search</h1>
      <form action="/search" className="flex gap-2 text-sm">
        <input name="q" defaultValue={q} placeholder="Search everything…" className="w-full max-w-xl rounded border border-slate-300 px-3 py-1.5" />
        <button className="rounded bg-slate-900 px-3 py-1.5 text-white">Search</button>
      </form>

      {sensitiveRefused ? (
        <p className="text-sm text-amber-700">
          That looks like a sensitive value. Results are filtered for your clearance — we don’t confirm whether a match exists.
        </p>
      ) : null}

      <SectionTitle>{q ? `${results.length} result(s) for “${q}”` : "Type a query"}</SectionTitle>
      {q && results.length === 0 && !sensitiveRefused ? <p className="text-sm text-slate-500">No matches.</p> : null}
      <ul className="space-y-2">
        {results.map((r) => (
          <li key={`${r.kind}:${r.id}`} className="card p-3">
            <div className="flex items-center justify-between gap-2">
              <Link href={r.href} className="font-medium">{r.title}</Link>
              <span className="chip bg-slate-100 text-slate-600">{r.kind}</span>
            </div>
            {r.snippet ? <p className="mt-1 text-xs text-slate-500">{r.snippet}</p> : null}
            <p className="mt-1 mono text-xs text-slate-400">{r.href}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
