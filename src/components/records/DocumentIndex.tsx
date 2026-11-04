import Link from "next/link";
import { RecordShell } from "./RecordShell";
import type { RecordCtx } from "@/lib/records/ctx";
import { computeDispositions } from "@/lib/evidence/disposition";
import { verifyAll } from "@/lib/evidence/verify";
import { whereDocLanded } from "@/lib/evidence/trace";
import { deriveExpectedDocuments } from "@/lib/judgment/expectedDocs";
import { DispositionChip } from "@/components/ui";
import type { DispositionStatus } from "@/lib/evidence/disposition";

export function DocumentIndex({ model, meta }: RecordCtx) {
  const dispo = new Map(computeDispositions(model).map((d) => [d.documentId, d]));
  const verifs = verifyAll(model);
  const byDoc = new Map<string, { ok: number; bad: number; human: number; total: number }>();
  for (const ev of model.evById.values()) {
    const b = byDoc.get(ev.document_id) ?? { ok: 0, bad: 0, human: 0, total: 0 };
    byDoc.set(ev.document_id, b);
  }
  const vById = new Map(verifs.map((v) => [v.extractedValueId, v]));
  for (const ev of model.evById.values()) {
    const b = byDoc.get(ev.document_id)!;
    b.total++;
    const st = vById.get(ev.id)?.status;
    if (st === "agreed_to_source") b.ok++;
    else if (st === "mismatch_with_source") b.bad++;
    else b.human++;
  }

  const expected = deriveExpectedDocuments(model);
  const missing = expected.filter((e) => !e.matchedDocumentId);

  return (
    <RecordShell title="4. Document index" slug="document-index" meta={meta}>
      <p className="text-xs text-slate-500">
        {model.documents.length} documents, their disposition, where each landed on the return, and verification stats.
      </p>
      <div className="card scroll-box">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-2 py-2">Doc</th>
              <th className="px-2 py-2">Type</th>
              <th className="px-2 py-2">Received</th>
              <th className="px-2 py-2">Disposition</th>
              <th className="px-2 py-2">Where used</th>
              <th className="px-2 py-2">Verified (ok/mismatch/human)</th>
            </tr>
          </thead>
          <tbody>
            {model.documents.map((d) => {
              const used = whereDocLanded(model, d.id).filter((w) => w.versionId === "v3");
              const vs = byDoc.get(d.id) ?? { ok: 0, bad: 0, human: 0, total: 0 };
              const dp = dispo.get(d.id);
              return (
                <tr key={d.id} className="border-t border-slate-100 align-top">
                  <td className="px-2 py-2">
                    <Link href={`/doc/${d.id}/p/1`} className="mono">{d.id}</Link>
                    <div className="text-xs text-slate-500">{d.title.slice(0, 40)}</div>
                  </td>
                  <td className="px-2 py-2 text-xs">{d.document_type}</td>
                  <td className="px-2 py-2 mono text-xs">{d.received_at?.slice(0, 10) ?? "—"}</td>
                  <td className="px-2 py-2">{dp ? <DispositionChip status={dp.status as DispositionStatus} /> : "—"}</td>
                  <td className="px-2 py-2 text-xs">
                    {used.length ? used.slice(0, 4).map((w) => w.key).join(", ") + (used.length > 4 ? ` +${used.length - 4}` : "") : <span className="text-slate-400">not cited</span>}
                  </td>
                  <td className="px-2 py-2 mono text-xs">
                    {vs.ok}/{vs.bad}/{vs.human} <span className="text-slate-400">of {vs.total}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card p-3">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Expected but missing ({missing.length})
        </div>
        {missing.length === 0 ? (
          <p className="text-sm text-slate-500">Every expected document is accounted for.</p>
        ) : (
          <ul className="space-y-0.5 text-sm">
            {missing.map((m) => (
              <li key={m.id}>
                <span className="chip bg-amber-100 text-amber-800">{m.source}</span> {m.description}
              </li>
            ))}
          </ul>
        )}
      </div>
    </RecordShell>
  );
}
