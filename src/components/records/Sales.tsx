import { RecordShell } from "./RecordShell";
import { NumberCell } from "./NumberCell";
import type { RecordCtx } from "@/lib/records/ctx";
import { all8949Lots, line } from "@/lib/checks/helpers";
import { toCents, formatCents } from "@/lib/money";
import { runChecks } from "@/lib/checks/runner";
import { tieOut, type TieOut } from "@/lib/records/tieout";

export function Sales({ model, versionId, meta }: RecordCtx) {
  const lots = all8949Lots(model, versionId);
  const flagged = new Set(
    runChecks({ model, versionId })
      .filter((f) => f.checkId === "MISSING_OR_ZERO_BASIS")
      .flatMap((f) => f.refs.filter((r) => r.includes("F8949"))),
  );
  const brokerOf = (key: string): string => {
    const ln = line(model, versionId, key);
    const src = ln?.sources.find((s) => /^ev-/.test(s));
    const ev = src ? model.evById.get(src) : undefined;
    const doc = ev ? model.docById.get(ev.document_id) : undefined;
    return doc?.issuer ?? doc?.title?.split(/ - |,/)[0] ?? "—";
  };
  const isException = (raw: string, basis: bigint | null, key: string) =>
    basis === null || basis === 0n || /noncovered|wash|transfer/i.test(raw) || flagged.has(`${versionId}:${key}`) || flagged.has(key);

  const sorted = [...lots].sort((a, b) => {
    const ax = isException(a.raw, a.basis, a.key) ? 0 : 1;
    const bx = isException(b.raw, b.basis, b.key) ? 0 : 1;
    return ax - bx || a.key.localeCompare(b.key);
  });

  const schd = [
    { label: "Net short-term gain/(loss)", key: "SchD.7" },
    { label: "Net long-term gain/(loss)", key: "SchD.15" },
    { label: "Combine (to F1040.7)", key: "SchD.16" },
    { label: "Unrecaptured §1250 gain", key: "SchD.19" },
  ];

  const tieOuts: TieOut[] = [
    tieOut("Capital gain", "F1040.7", toCents(line(model, versionId, "SchD.16")?.value) ?? 0n, toCents(line(model, versionId, "F1040.7")?.value)),
    tieOut("F4797 §1231 gain → Sch D", "SchD.11", toCents(line(model, versionId, "F4797.9")?.value) ?? 0n, toCents(line(model, versionId, "SchD.11")?.value)),
  ];

  const scorp = line(model, versionId, "F8949.F.SCORP");

  return (
    <RecordShell title="6. Sales detail" slug="sales-detail" meta={meta} tieOuts={tieOuts}>
      <p className="text-xs text-slate-500">Form 8949 lots, exceptions first (missing/zero basis, noncovered, wash, digital assets). {lots.length} lots.</p>
      <div className="card scroll-box">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-left uppercase text-slate-500">
            <tr>
              <th className="px-2 py-2">Lot</th><th className="px-2 py-2">Broker</th><th className="px-2 py-2">Box</th>
              <th className="px-2 py-2">Acq / sold</th><th className="px-2 py-2 text-right">Proceeds</th>
              <th className="px-2 py-2 text-right">Basis</th><th className="px-2 py-2">Flag</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((l) => {
              const exc = isException(l.raw, l.basis, l.key);
              return (
                <tr key={l.key} className={`border-t border-slate-100 ${exc ? "bg-amber-50" : ""}`}>
                  <td className="px-2 py-1 mono">{l.key.replace("F8949.", "")}</td>
                  <td className="px-2 py-1">{brokerOf(l.key)}</td>
                  <td className="px-2 py-1">{l.box}</td>
                  <td className="px-2 py-1 mono">{l.acquired ?? "various"} / {l.sold ?? "various"}</td>
                  <td className="px-2 py-1 text-right mono">{formatCents(l.proceeds)}</td>
                  <td className="px-2 py-1 text-right mono">{l.basis === null ? "not reported" : formatCents(l.basis)}</td>
                  <td className="px-2 py-1">{exc ? <span className="chip bg-amber-100 text-amber-800">exception</span> : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="card scroll-box">
          <div className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Schedule D reconciliation</div>
          <table className="w-full text-sm">
            <tbody>
              {schd.map((r) => (
                <tr key={r.key} className="border-t border-slate-100">
                  <td className="px-3 py-2">{r.label}</td>
                  <td className="px-3 py-2 text-right"><NumberCell cents={toCents(line(model, versionId, r.key)?.value)} lineKey={r.key} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card p-3 text-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Other dispositions</div>
          <ul className="space-y-1">
            <li>Form 4797 §1231 gain (1200 Barton Hills sale): <NumberCell cents={toCents(line(model, versionId, "F4797.9")?.value)} lineKey="F4797.9" /></li>
            {scorp ? <li>S-corp excess distribution (F8949.F.SCORP): <NumberCell cents={toCents(scorp.value)} lineKey="F8949.F.SCORP" /></li> : null}
          </ul>
        </div>
      </div>
    </RecordShell>
  );
}
