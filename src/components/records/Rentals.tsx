import Link from "next/link";
import { RecordShell } from "./RecordShell";
import { NumberCell } from "./NumberCell";
import type { RecordCtx } from "@/lib/records/ctx";
import { line, lineValueCents } from "@/lib/checks/helpers";
import { tieOut, type TieOut } from "@/lib/records/tieout";

export function Rentals({ model, versionId, meta }: RecordCtx) {
  const L = (key: string) => lineValueCents(line(model, versionId, key));
  const label = (key: string) => line(model, versionId, key)?.label ?? key;

  const propRows: Array<{ label: string; a: string; b: string }> = [
    { label: "Rents received", a: "SchE.3A", b: "SchE.3B" },
    { label: "Insurance", a: "SchE.9A", b: "SchE.9B" },
    { label: "Management fees", a: "SchE.11A", b: "SchE.11B" },
    { label: "Mortgage interest", a: "SchE.12A", b: "SchE.12B" },
    { label: "Repairs (incl. HVAC — property A)", a: "SchE.14A", b: "SchE.14B" },
    { label: "Taxes", a: "SchE.16A", b: "SchE.16B" },
    { label: "Depreciation", a: "SchE.18A", b: "SchE.18B" },
    { label: "Total expenses", a: "SchE.20A", b: "SchE.20B" },
    { label: "Income or (loss)", a: "SchE.21A", b: "SchE.21B" },
    { label: "Deductible after limitation", a: "SchE.22A", b: "SchE.22B" },
  ];

  const f8582 = [
    { label: "Rental activities with net income (incl. 4797 gain)", key: "F8582.1a" },
    { label: "Rental activities with net loss", key: "F8582.1b" },
    { label: "Prior-year unallowed rental losses", key: "F8582.1c" },
    { label: "Other passive activities with net income", key: "F8582.3a" },
    { label: "Combine (net passive)", key: "F8582.4" },
  ];

  const tieOuts: TieOut[] = [
    tieOut("Deductible rental loss (A+B)", "SchE.26", (L("SchE.22A") ?? 0n) + (L("SchE.22B") ?? 0n), L("SchE.26")),
  ];

  return (
    <RecordShell title="8. Rentals and passive losses" slug="rentals" meta={meta} tieOuts={tieOuts}>
      <div className="card scroll-box">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">Line</th><th className="px-3 py-2 text-right">A — 1450 Fremont (CA)</th><th className="px-3 py-2 text-right">B — 1200 Barton Hills (TX)</th></tr>
          </thead>
          <tbody>
            {propRows.map((r) => (
              <tr key={r.label} className="border-t border-slate-100">
                <td className="px-3 py-2">{r.label}{r.a === "SchE.14A" ? <Link href="/decisions" className="ml-1 chip bg-violet-100 text-violet-800 no-underline">HVAC judgment</Link> : null}</td>
                <td className="px-3 py-2 text-right"><NumberCell cents={L(r.a)} lineKey={r.a} /></td>
                <td className="px-3 py-2 text-right"><NumberCell cents={L(r.b)} lineKey={r.b} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card scroll-box">
        <div className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Form 8582 — passive loss limitation</div>
        <table className="w-full text-sm">
          <tbody>
            {f8582.map((r) => (
              <tr key={r.key} className="border-t border-slate-100">
                <td className="px-3 py-2">{r.label} <span className="text-xs text-slate-400">{label(r.key)}</span></td>
                <td className="px-3 py-2 text-right"><NumberCell cents={L(r.key)} lineKey={r.key} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-slate-600">
        Prior suspended passive losses (6,300 Fremont + 9,850 Barton Hills from 2024) are released this year: the 1200 Barton
        Hills disposal frees that property’s suspended loss, and the net passive position turns positive after the Form 4797
        §1231 gain. The HVAC repair/improvement judgment flows through Repairs — property A.
      </p>
    </RecordShell>
  );
}
