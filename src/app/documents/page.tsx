import Link from "next/link";
import { loadModel } from "@/lib/packet/load";
import { getSession } from "@/lib/session";
import { computeDispositions } from "@/lib/evidence/disposition";
import { DispositionChip, SectionTitle } from "@/components/ui";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const model = loadModel();
  const session = await getSession();
  const disp = new Map(computeDispositions(model, session.asOf).map((d) => [d.documentId, d]));

  const q = (sp.q ?? "").toLowerCase();
  let docs = model.documents;
  if (sp.status) docs = docs.filter((d) => disp.get(d.id)?.status === sp.status);
  if (sp.type) docs = docs.filter((d) => d.document_type === sp.type);
  if (q)
    docs = docs.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.id.toLowerCase().includes(q) ||
        (d.issuer ?? "").toLowerCase().includes(q),
    );

  const statuses = ["used", "superseded", "received_after_return", "structured_elsewhere", "duplicate_not_counted", "partial_extraction", "unaccounted"];

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Documents ({docs.length})</h1>
        <form className="flex gap-2 text-sm">
          <input
            name="q"
            defaultValue={sp.q}
            placeholder="Search title, issuer, id…"
            className="rounded border border-slate-300 px-2 py-1"
          />
          <button className="rounded bg-slate-900 px-3 py-1 text-white">Search</button>
        </form>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Link href="/documents" className="chip bg-slate-100 text-slate-700">
          all
        </Link>
        {statuses.map((s) => (
          <Link key={s} href={`/documents?status=${s}`} className="chip bg-slate-100 text-slate-700">
            {s.replace(/_/g, " ")}
          </Link>
        ))}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Doc</th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Received</th>
              <th className="px-3 py-2">Disposition</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => {
              const dd = disp.get(d.id);
              return (
                <tr key={d.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <Link href={`/doc/${d.id}`} className="mono">
                      {d.id}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{d.title}</td>
                  <td className="px-3 py-2 text-slate-500">{d.document_type}</td>
                  <td className="px-3 py-2 text-slate-500">{d.received_at?.slice(0, 10) ?? "—"}</td>
                  <td className="px-3 py-2">{dd ? <DispositionChip status={dd.status} /> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <SectionTitle>Why this isn&apos;t a spreadsheet</SectionTitle>
      <p className="text-sm text-slate-600">
        Every document carries a disposition that proves it was considered — used, superseded, a duplicate counted once, or
        received after the return. That is how the workpaper shows 74/74 accounted.
      </p>
    </div>
  );
}
