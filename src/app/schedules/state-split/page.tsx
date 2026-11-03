import Link from "next/link";
import { loadModel } from "@/lib/packet/load";
import { getSession } from "@/lib/session";
import { currentVersion } from "@/lib/evidence/disposition";
import { linesOf } from "@/lib/checks/helpers";
import { runChecks } from "@/lib/checks/runner";
import { SectionTitle, Stat } from "@/components/ui";

const COLS = ["A", "B", "C", "D", "E"] as const;
const COL_LABEL: Record<string, string> = {
  A: "Federal",
  B: "CA subtractions",
  C: "CA additions",
  D: "Total",
  E: "CA source",
};

function fmt(v: unknown): string {
  return typeof v === "number" ? v.toLocaleString() : v == null ? "—" : String(v);
}

export default async function StateSplitPage() {
  const model = loadModel();
  const session = await getSession();
  const versionId = currentVersion(model, session.asOf)?.version ?? "v3";

  const residency = ((model.raw.household as Record<string, unknown>).residency ?? []) as Array<Record<string, unknown>>;
  const paystub = model.documents.find((d) => d.document_type === "paystub");
  const caYtd = paystub ? (model.evsByDoc.get(paystub.id) ?? []).find((e) => /ca.*wage/i.test(e.field)) : undefined;

  // Group SchCA540NR lines by their line number, collecting columns A–E.
  const rows = new Map<string, { label: string; cols: Record<string, { value: unknown; key: string }> }>();
  for (const ln of linesOf(model, versionId)) {
    if (ln.form !== "SchCA540NR") continue;
    const parts = ln.key.split(".");
    const col = parts[parts.length - 1];
    const lineNo = parts.slice(1, -1).join(".");
    if (!COLS.includes(col as (typeof COLS)[number])) continue;
    const row = rows.get(lineNo) ?? { label: ln.label ?? lineNo, cols: {} };
    row.cols[col] = { value: ln.value, key: ln.key };
    if (ln.label) row.label = ln.label;
    rows.set(lineNo, row);
  }

  const stateFinding = runChecks({ model, versionId }).find((f) => f.checkId === "STATE_SOURCE_WAGES");

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Split income between states</h1>

      <SectionTitle>Residency timeline</SectionTitle>
      <div className="flex overflow-hidden rounded border border-slate-200">
        {residency.map((r, i) => (
          <div
            key={i}
            className={`px-3 py-2 text-sm ${r.state === "CA" ? "bg-sky-100 text-sky-900" : "bg-emerald-100 text-emerald-900"}`}
            style={{ flex: 1 }}
          >
            <div className="font-semibold">{String(r.state)}</div>
            <div className="text-xs">
              {String(r.from)} → {String(r.to)} ({String(r.status)})
            </div>
          </div>
        ))}
      </div>

      <SectionTitle>Three separate facts for wages</SectionTitle>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Stat label="Payroll state reporting" value={caYtd ? Number(caYtd.value).toLocaleString() : "—"} sub="CA taxable wages YTD on the paystub" />
        <Stat label="Actual work location" value="Austin, TX" sub="from 2025-07-15 (post-move)" />
        <Stat label="Residency" value="CA → TX" sub="moved 2025-07-15" />
      </div>
      {stateFinding ? (
        <div className="card border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <span className="chip bg-violet-100 text-violet-800">judgment</span> {stateFinding.explanation}{" "}
          <Link href="/checks?area=State%20allocation">see check →</Link>
        </div>
      ) : null}

      <SectionTitle>Allocation (Schedule CA 540NR, columns A–E)</SectionTitle>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Line</th>
              <th className="px-3 py-2">Item</th>
              {COLS.map((c) => (
                <th key={c} className="px-3 py-2 text-right">
                  {c}: {COL_LABEL[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...rows.entries()].map(([lineNo, row]) => (
              <tr key={lineNo} className="border-t border-slate-100">
                <td className="px-3 py-2 mono">{lineNo}</td>
                <td className="px-3 py-2">{row.label}</td>
                {COLS.map((c) => (
                  <td key={c} className="px-3 py-2 text-right mono">
                    {row.cols[c] ? (
                      <Link href={`/line/${versionId}/${encodeURIComponent(row.cols[c].key)}`} className="mono">
                        {fmt(row.cols[c].value)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Column E (California source) is the allocation the return relies on. The wages row is flagged above: payroll
        reporting, work location and residency are three different facts, and the preparer owns the split.
      </p>
    </div>
  );
}
