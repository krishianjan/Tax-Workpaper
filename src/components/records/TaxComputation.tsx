import { RecordShell } from "./RecordShell";
import { NumberCell } from "./NumberCell";
import type { RecordCtx } from "@/lib/records/ctx";
import { line } from "@/lib/checks/helpers";
import { toCents, formatCents, type Cents } from "@/lib/money";
import { recomputeRegularTax } from "@/lib/records/taxComputation";
import { tieOut, type TieOut } from "@/lib/records/tieout";

export function TaxComputation({ model, versionId, meta }: RecordCtx) {
  const v = (key: string): Cents | null => toCents(line(model, versionId, key)?.value);
  const rc = recomputeRegularTax(model, versionId);

  const walk: Array<{ label: string; key: string; cents: Cents | null; strong?: boolean }> = [
    { label: "Taxable income", key: "F1040.15", cents: v("F1040.15") },
    { label: "Regular tax (Schedule D worksheet)", key: "F1040.16", cents: v("F1040.16"), strong: true },
    { label: "Alternative minimum tax (Form 6251)", key: "F6251.11", cents: v("F6251.11") },
    { label: "Schedule 2, Part I (AMT etc.)", key: "Sch2.3", cents: v("Sch2.3") },
    { label: "Add tax + Schedule 2 Part I", key: "F1040.18", cents: v("F1040.18"), strong: true },
    { label: "Child tax credit / ODC", key: "F1040.19", cents: v("F1040.19") },
    { label: "Schedule 3 credits", key: "F1040.20", cents: v("F1040.20") },
    { label: "Tax after nonrefundable credits", key: "F1040.22", cents: v("F1040.22"), strong: true },
    { label: "Other taxes (SE, Add’l Medicare, NIIT)", key: "F1040.23", cents: v("F1040.23") },
    { label: "Total tax", key: "F1040.24", cents: v("F1040.24"), strong: true },
  ];

  const other: Array<{ label: string; key: string }> = [
    { label: "Self-employment tax", key: "Sch2.4" },
    { label: "Additional Medicare tax", key: "Sch2.11" },
    { label: "Net investment income tax", key: "Sch2.12" },
  ];

  const tieOuts: TieOut[] = [
    tieOut("Tax + Sch 2 Part I", "F1040.18", (v("F1040.16") ?? 0n) + (v("F1040.17") ?? 0n), v("F1040.18")),
    tieOut("Total tax = after-credit + other", "F1040.24", (v("F1040.22") ?? 0n) + (v("F1040.23") ?? 0n), v("F1040.24")),
    tieOut("AMT (6251) → Schedule 2", "Sch2.1", v("F6251.11") ?? 0n, v("Sch2.1")),
  ];

  return (
    <RecordShell title="2. Tax computation" slug="tax-computation" meta={meta} tieOuts={tieOuts}>
      <div className="card scroll-box">
        <table className="w-full text-sm">
          <tbody>
            {walk.map((r) => (
              <tr key={r.key} className={`border-t border-slate-100 ${r.strong ? "font-semibold" : ""}`}>
                <td className="px-3 py-2">{r.label}</td>
                <td className="px-3 py-2 text-right"><NumberCell cents={r.cents} lineKey={r.key} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`card p-3 text-sm ${rc.tiesWithinDollar ? "" : "border-amber-300"}`}>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Independent recompute of regular tax (does not trust the engine)
        </div>
        <p>
          From the MFJ brackets + the 0/15/20 LTCG thresholds, with unrecaptured §1250 at {(rc.result.rate1250 * 100).toFixed(0)}%:
          ordinary {formatCents(BigInt(Math.round(rc.result.ordinaryIncome)) * 100n)} base ·
          regular tax = <span className="mono">{formatCents(rc.recomputedCents)}</span> vs engine F1040.16{" "}
          <span className="mono">{formatCents(rc.engineCents)}</span>{" "}
          {rc.tiesWithinDollar ? (
            <span className="text-emerald-700">ties ✓</span>
          ) : (
            <span className="text-amber-700">Δ {formatCents(rc.deltaCents)} — reconcile the Schedule D Tax Worksheet (TAX_COMPUTATION_RECOMPUTE)</span>
          )}
        </p>
      </div>

      <div className="card scroll-box">
        <div className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Other taxes (Schedule 2, Part II)</div>
        <table className="w-full text-sm">
          <tbody>
            {other.map((r) => (
              <tr key={r.key} className="border-t border-slate-100">
                <td className="px-3 py-2">{r.label}</td>
                <td className="px-3 py-2 text-right"><NumberCell cents={v(r.key)} lineKey={r.key} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </RecordShell>
  );
}
