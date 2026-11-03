import Link from "next/link";
import { loadModel } from "@/lib/packet/load";
import { getSession } from "@/lib/session";
import { currentVersion } from "@/lib/evidence/disposition";
import { all8949Lots, linesOf, line } from "@/lib/checks/helpers";
import { runChecks } from "@/lib/checks/runner";
import { formatCents, toCents } from "@/lib/money";
import { SectionTitle } from "@/components/ui";

export default async function Form8949Page({ searchParams }: { searchParams: Promise<{ all?: string; q?: string }> }) {
  const sp = await searchParams;
  const model = loadModel();
  const session = await getSession();
  const versionId = currentVersion(model, session.asOf)?.version ?? "v3";

  const lots = all8949Lots(model, versionId);
  // Which lot keys are flagged by failing/warning basis checks.
  const flagged = new Set(
    runChecks({ model, versionId })
      .filter((f) => f.checkId === "MISSING_OR_ZERO_BASIS")
      .flatMap((f) => f.refs.filter((r) => r.includes("F8949"))),
  );

  // Broker for each lot = issuer of its first source document.
  const brokerOf = (key: string): string => {
    const ln = line(model, versionId, key);
    const src = ln?.sources.find((s) => /^ev-/.test(s));
    const ev = src ? model.evById.get(src) : undefined;
    const doc = ev ? model.docById.get(ev.document_id) : undefined;
    return doc?.issuer ?? doc?.title?.split(/ - |,/)[0] ?? "Unknown broker";
  };

  const isException = (l: (typeof lots)[number]) =>
    l.basis === null || l.basis === 0n || /noncovered|wash|transfer/i.test(l.raw) || flagged.has(`${versionId}:${l.key}`) || flagged.has(l.key);

  const q = (sp.q ?? "").toLowerCase();
  let view = lots.filter((l) => (sp.all ? true : isException(l)));
  if (q) view = view.filter((l) => l.raw.toLowerCase().includes(q) || l.key.toLowerCase().includes(q));

  // Group by box and reconcile to the F8949.<box>.total line.
  const boxes = [...new Set(lots.map((l) => l.box).filter(Boolean))] as string[];
  const boxSummary = boxes.map((box) => {
    const inBox = lots.filter((l) => l.box === box);
    const proceeds = inBox.reduce((s, l) => s + (l.proceeds ?? 0n), 0n);
    // The total line's VALUE is the net gain/loss; the proceeds figure is in its label.
    const totalLine = line(model, versionId, `F8949.${box}.total`);
    const m = totalLine?.label?.match(/proceeds\s+([\d,]+\.\d{2})/i);
    const stated = m ? toCents(m[1]) : null;
    return { box, count: inBox.length, proceeds, stated, reconciles: stated === null || stated === proceeds, exceptions: inBox.filter(isException).length };
  });

  const schD = linesOf(model, versionId).filter((l) => l.form === "SchD");

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Form 8949 — {lots.length} lots</h1>
        <form className="flex gap-2 text-sm">
          <input name="q" defaultValue={sp.q} placeholder="search lots…" className="rounded border border-slate-300 px-2 py-1" />
          {sp.all ? <input type="hidden" name="all" value="1" /> : null}
          <button className="rounded bg-slate-900 px-3 py-1 text-white">Search</button>
        </form>
      </div>

      <SectionTitle>Box totals reconciled to Schedule D</SectionTitle>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Box</th>
              <th className="px-3 py-2">Lots</th>
              <th className="px-3 py-2">Exceptions</th>
              <th className="px-3 py-2">Σ proceeds</th>
              <th className="px-3 py-2">Stated total</th>
              <th className="px-3 py-2">Reconciles</th>
            </tr>
          </thead>
          <tbody>
            {boxSummary.map((b) => (
              <tr key={b.box} className="border-t border-slate-100">
                <td className="px-3 py-2 mono">{b.box}</td>
                <td className="px-3 py-2">{b.count}</td>
                <td className="px-3 py-2">{b.exceptions > 0 ? <span className="chip bg-amber-100 text-amber-800">{b.exceptions}</span> : "—"}</td>
                <td className="px-3 py-2 mono">{formatCents(b.proceeds)}</td>
                <td className="px-3 py-2 mono">{b.stated === null ? "—" : formatCents(b.stated)}</td>
                <td className="px-3 py-2">
                  {b.reconciles ? <span className="chip bg-emerald-100 text-emerald-800">yes</span> : <span className="chip bg-red-100 text-red-800">no</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2 text-xs">
        <Link href="/schedules/8949" className={`chip ${!sp.all ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>
          exceptions first ({lots.filter(isException).length})
        </Link>
        <Link href="/schedules/8949?all=1" className={`chip ${sp.all ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>
          all lots ({lots.length})
        </Link>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Lot</th>
              <th className="px-3 py-2">Broker</th>
              <th className="px-3 py-2">Acquired</th>
              <th className="px-3 py-2">Sold</th>
              <th className="px-3 py-2">Proceeds</th>
              <th className="px-3 py-2">Basis</th>
              <th className="px-3 py-2">Flag</th>
            </tr>
          </thead>
          <tbody>
            {view.slice(0, 300).map((l) => (
              <tr key={l.key} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2">
                  <Link href={`/line/${versionId}/${encodeURIComponent(l.key)}`} className="mono">
                    {l.key}
                  </Link>
                </td>
                <td className="px-3 py-2 text-slate-600">{brokerOf(l.key)}</td>
                <td className="px-3 py-2 mono">{l.acquired ?? "—"}</td>
                <td className="px-3 py-2 mono">{l.sold ?? "—"}</td>
                <td className="px-3 py-2 mono">{formatCents(l.proceeds)}</td>
                <td className="px-3 py-2 mono">{l.basis === null ? <span className="chip bg-amber-100 text-amber-800">not reported</span> : formatCents(l.basis)}</td>
                <td className="px-3 py-2">{isException(l) ? <span className="chip bg-red-100 text-red-800">exception</span> : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {view.length > 300 ? <p className="text-xs text-slate-400">Showing first 300 of {view.length}. Refine with search.</p> : null}

      <SectionTitle>Schedule D lines</SectionTitle>
      <div className="flex flex-wrap gap-2 text-sm">
        {schD.map((l) => (
          <Link key={l.key} href={`/line/${versionId}/${encodeURIComponent(l.key)}`} className="chip bg-slate-100 text-slate-700">
            {l.key}: {typeof l.value === "number" ? l.value.toLocaleString() : String(l.value)}
          </Link>
        ))}
      </div>
    </div>
  );
}
