import Link from "next/link";
import { RecordShell } from "./RecordShell";
import { NumberCell } from "./NumberCell";
import type { RecordCtx } from "@/lib/records/ctx";
import { whereDocLanded } from "@/lib/evidence/trace";
import { line, lineValueCents } from "@/lib/checks/helpers";
import { toCents } from "@/lib/money";
import { tieOut, type TieOut } from "@/lib/records/tieout";

const K1_DOCS = ["D37", "D38", "D39", "D40"];

export function K1Lines({ model, versionId, meta }: RecordCtx) {
  const groups = K1_DOCS.map((docId) => {
    const doc = model.docById.get(docId);
    const landed = whereDocLanded(model, docId).filter((w) => w.versionId === versionId);
    return { docId, doc, landed };
  }).filter((g) => g.doc);

  const tieOuts: TieOut[] = [
    tieOut(
      "Partnership + S-corp income",
      "SchE.32",
      (lineValueCents(line(model, versionId, "SchE.28A")) ?? 0n) + (lineValueCents(line(model, versionId, "SchE.28B")) ?? 0n),
      lineValueCents(line(model, versionId, "SchE.32")),
    ),
  ];

  return (
    <RecordShell title="9. K-1 lines" slug="k1-lines" meta={meta} tieOuts={tieOuts}>
      <p className="text-xs text-slate-500">
        Each K-1 box traced to the return line it feeds and its evidence. Ridgeline 1065 (D37) + state supplement (D38);
        Woodworks 1120-S 2025 (D39); the late 2023 K-1 (D40) that rewrote the S-corp basis assumption.
      </p>
      {groups.map((g) => (
        <div key={g.docId} className="card scroll-box">
          <div className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Link href={`/doc/${g.docId}/p/1`} className="mono">{g.docId}</Link> — {g.doc!.title}
          </div>
          {g.landed.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-500">Diagnostic / history only — no v3 line cites this K-1 directly.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="px-3 py-2">Return line</th><th className="px-3 py-2">Label</th><th className="px-3 py-2 text-right">Value</th><th className="px-3 py-2">Evidence</th></tr>
              </thead>
              <tbody>
                {g.landed.map((w) => (
                  <tr key={w.key} className="border-t border-slate-100">
                    <td className="px-3 py-2 mono">{w.key}</td>
                    <td className="px-3 py-2 text-xs">{w.label}</td>
                    <td className="px-3 py-2 text-right"><NumberCell cents={toCents(w.value)} lineKey={w.key} /></td>
                    <td className="px-3 py-2 mono text-xs">{w.via.filter((v) => v.startsWith("ev-")).join(", ") || g.docId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </RecordShell>
  );
}
