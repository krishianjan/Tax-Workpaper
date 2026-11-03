import Link from "next/link";
import { notFound } from "next/navigation";
import { loadModel } from "@/lib/packet/load";
import { getSession } from "@/lib/session";
import { verifyValue } from "@/lib/evidence/verify";
import { computeDispositions } from "@/lib/evidence/disposition";
import { computeDocumentLinks, computePageDuplicates } from "@/lib/evidence/links";
import { whereDocLanded } from "@/lib/evidence/trace";
import { maskValue } from "@/lib/mask";
import { listAttachments } from "@/lib/workpaper";
import { addNote } from "@/app/actions";
import { VerificationBadge, Confidence, DispositionChip, SectionTitle } from "@/components/ui";

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const model = loadModel();
  const doc = model.docById.get(id);
  if (!doc) notFound();
  const session = await getSession();

  const disp = computeDispositions(model, session.asOf).find((d) => d.documentId === id)!;
  const evs = model.evsByDoc.get(id) ?? [];
  const landed = whereDocLanded(model, id);
  const links = computeDocumentLinks(model).filter((l) => l.fromDocId === id || l.toDocId === id);
  const pageDupes = computePageDuplicates(doc);
  const attachments = await listAttachments("document", id);

  const landedByVersion = new Map<string, typeof landed>();
  for (const l of landed) {
    const arr = landedByVersion.get(l.versionId) ?? [];
    arr.push(l);
    landedByVersion.set(l.versionId, arr);
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <span className="mono text-slate-500">{doc.id}</span>
          <DispositionChip status={disp.status} />
          {doc.marked_corrected ? <span className="chip bg-amber-100 text-amber-800">CORRECTED</span> : null}
        </div>
        <h1 className="mt-1 text-xl font-semibold">{doc.title}</h1>
        <p className="text-sm text-slate-500">
          {doc.document_type} · {doc.issuer ?? "—"} · belongs to {doc.belongs_to ?? "—"} · received{" "}
          {doc.received_at?.slice(0, 10) ?? "—"} · {doc.page_count} page(s) · extraction {doc.extraction.status}
        </p>
        <p className="mt-2 rounded bg-slate-100 p-2 text-sm text-slate-700">{disp.reason}</p>
      </div>

      <section>
        <SectionTitle>Pages</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {doc.pages.map((p) => {
            const dup = pageDupes.find((x) => x.pageNo === p.page);
            return (
              <Link key={p.page} href={`/doc/${id}/p/${p.page}`} className="chip bg-sky-100 text-sky-800">
                page {p.page}
                {dup ? ` (= page ${dup.duplicateOfPage})` : ""}
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <SectionTitle>Extracted values ({evs.length}) — verified against printed content</SectionTitle>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">ev</th>
                <th className="px-3 py-2">field</th>
                <th className="px-3 py-2">value</th>
                <th className="px-3 py-2">type</th>
                <th className="px-3 py-2">verification</th>
              </tr>
            </thead>
            <tbody>
              {evs.map((ev) => {
                const v = verifyValue(model, ev);
                return (
                  <tr key={ev.id} className="border-t border-slate-100 align-top hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <Link href={`/doc/${id}/p/${ev.page ?? 1}#${ev.id}`} className="mono">
                        {ev.id}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{ev.label ?? ev.field}</td>
                    <td className="px-3 py-2 mono">{maskValue(ev.value, ev.value_type, session.cleared)}</td>
                    <td className="px-3 py-2 text-slate-500">{ev.value_type}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <VerificationBadge status={v.status} />
                        <Confidence value={ev.confidence} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionTitle>Where this document landed (across versions)</SectionTitle>
        {landed.length === 0 ? (
          <p className="text-sm text-slate-500">
            Not cited by any return line. Its disposition above explains why it was still accounted for.
          </p>
        ) : (
          <div className="space-y-3">
            {[...landedByVersion.entries()].map(([ver, lines]) => (
              <div key={ver} className="card p-3">
                <div className="mb-1 text-xs font-semibold uppercase text-slate-500">{ver}</div>
                <ul className="space-y-1 text-sm">
                  {lines.map((l) => (
                    <li key={l.key}>
                      <Link href={`/line/${ver}/${encodeURIComponent(l.key)}`} className="mono">
                        {l.key}
                      </Link>{" "}
                      — {l.label} <span className="text-slate-400">via {l.via.join(", ")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {links.length > 0 ? (
        <section>
          <SectionTitle>Linked documents</SectionTitle>
          <ul className="space-y-2 text-sm">
            {links.map((l, i) => (
              <li key={i} className="card p-3">
                <span className="chip bg-slate-100 text-slate-700">{l.kind.replace(/_/g, " ")}</span>{" "}
                <Link href={`/doc/${l.fromDocId}`} className="mono">
                  {l.fromDocId}
                </Link>{" "}
                →{" "}
                <Link href={`/doc/${l.toDocId}`} className="mono">
                  {l.toDocId}
                </Link>
                <span className="ml-2 text-slate-500">{String((l.basis as { reason?: string }).reason ?? "")}</span>
                {Array.isArray((l.basis as { diff?: unknown[] }).diff) ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-slate-600">field-by-field diff</summary>
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {((l.basis as { diff: Array<{ field: string; old: string | null; new: string | null }> }).diff).map(
                        (d, j) => (
                          <li key={j} className="mono">
                            {d.field}: {d.old ?? "∅"} → {d.new ?? "∅"}
                          </li>
                        ),
                      )}
                    </ul>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <SectionTitle>Attachments &amp; notes ({attachments.length})</SectionTitle>
        <ul className="mb-3 space-y-1 text-sm">
          {attachments.map((a) => (
            <li key={a.id} className="card p-2">
              <span className="chip bg-slate-100 text-slate-600">{a.kind}</span> {a.text}
              <span className="ml-2 text-xs text-slate-400">
                — {a.uploadedBy} · {a.at.toISOString().slice(0, 16).replace("T", " ")}
              </span>
            </li>
          ))}
        </ul>
        <form action={addNote} className="flex flex-col gap-2 md:flex-row">
          <input type="hidden" name="targetKind" value="document" />
          <input type="hidden" name="targetId" value={id} />
          <input
            name="text"
            placeholder="Add a note as evidence…"
            className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
            required
          />
          <button className="rounded bg-slate-900 px-3 py-1 text-sm text-white">Attach note</button>
        </form>
        <p className="mt-1 text-xs text-slate-400">Requires the database (run npm run seed). Every attach writes to the event log.</p>
      </section>
    </div>
  );
}
