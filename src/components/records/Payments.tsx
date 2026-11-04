import { RecordShell } from "./RecordShell";
import { NumberCell } from "./NumberCell";
import type { RecordCtx } from "@/lib/records/ctx";
import { line } from "@/lib/checks/helpers";
import { toCents, formatCents, type Cents } from "@/lib/money";
import { returnTotals } from "@/lib/change/effective";
import { toChangeMode } from "@/lib/records/mode";
import { tieOut, type TieOut } from "@/lib/records/tieout";

function sumAgency(rows: Array<{ amount: number }> | undefined): Cents {
  return (rows ?? []).reduce((s, r) => s + (toCents(r.amount) ?? 0n), 0n);
}

export function Payments({ model, versionId, mode, adjustments, meta }: RecordCtx) {
  const v = (key: string): Cents | null => toCents(line(model, versionId, key)?.value);
  const totals = returnTotals(model, versionId, toChangeMode(mode), adjustments);

  const agency = model.raw.tax_agency_records as Record<string, unknown>;
  const irsTranscript = (agency.irs_account_transcript_2025 as Array<{ transactions: Array<{ amount: number }> }>)?.[0]?.transactions;
  const irsEstimates = sumAgency(irsTranscript);
  const ftb = agency.ftb_account as { tax_year_2025_payments?: Array<{ amount: number }> } | undefined;
  const ftbEstimates = sumAgency(ftb?.tax_year_2025_payments);

  const fedRows = [
    { label: "Federal withholding (W-2)", key: "F1040.25d", cents: v("F1040.25d") },
    { label: "Federal estimated payments", key: "F1040.26", cents: v("F1040.26") },
    { label: "Schedule 3 payments/credits", key: "F1040.31", cents: v("F1040.31") },
    { label: "Total federal payments", key: "F1040.33", cents: v("F1040.33"), strong: true },
  ];
  const caRows = [
    { label: "California withholding", key: "F540NR.71", cents: v("F540NR.71") },
    { label: "California estimated payments", key: "F540NR.72", cents: v("F540NR.72") },
    { label: "Extension payment (FTB 3519)", key: "F540NR.73", cents: v("F540NR.73") },
    { label: "Total California payments", key: "F540NR.78", cents: v("F540NR.78"), strong: true },
  ];

  const tieOuts: TieOut[] = [
    tieOut("Federal payments", "F1040.33", (v("F1040.25d") ?? 0n) + (v("F1040.26") ?? 0n) + (v("F1040.31") ?? 0n), v("F1040.33")),
    tieOut("California payments", "F540NR.78", (v("F540NR.71") ?? 0n) + (v("F540NR.72") ?? 0n) + (v("F540NR.73") ?? 0n), v("F540NR.78")),
  ];

  return (
    <RecordShell title="13. Payments" slug="payments" meta={meta} tieOuts={tieOuts}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <PaymentTable title="Federal" rows={fedRows} />
        <PaymentTable title="California" rows={caRows} />
      </div>

      <div className="card p-3 text-sm">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Agency reconciliation</div>
        <ul className="space-y-1">
          <li className="flex justify-between">
            <span>IRS transcript estimated payments (as of 2026-03-12)</span>
            <span className="mono">
              {formatCents(irsEstimates)} vs engine {formatCents(v("F1040.26"))}{" "}
              {irsEstimates === v("F1040.26") ? <span className="text-emerald-700">✓</span> : <span className="text-amber-700">Δ {formatCents((v("F1040.26") ?? 0n) - irsEstimates)} (Q4 estimate)</span>}
            </span>
          </li>
          <li className="flex justify-between">
            <span>FTB 2025 estimated payments (designated 2025)</span>
            <span className="mono">
              {formatCents(ftbEstimates)} vs engine {formatCents(v("F540NR.72"))}{" "}
              {ftbEstimates === v("F540NR.72") ? <span className="text-emerald-700">✓</span> : <span className="text-amber-700">Δ {formatCents((v("F540NR.72") ?? 0n) - ftbEstimates)} (09/15 designated 2024)</span>}
            </span>
          </li>
        </ul>
      </div>

      <div className="card p-3 text-sm">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{meta.modeLabel} payments (with approved effects)</div>
        <div className="flex flex-wrap gap-6">
          <span>Federal: <span className="mono">{formatCents(totals.payFed)}</span></span>
          <span>California: <span className="mono">{formatCents(totals.payCa)}</span></span>
        </div>
      </div>
    </RecordShell>
  );
}

function PaymentTable({ title, rows }: { title: string; rows: Array<{ label: string; key: string; cents: Cents | null; strong?: boolean }> }) {
  return (
    <div className="card scroll-box">
      <div className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={`border-t border-slate-100 ${r.strong ? "font-semibold" : ""}`}>
              <td className="px-3 py-2">{r.label}</td>
              <td className="px-3 py-2 text-right"><NumberCell cents={r.cents} lineKey={r.key} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
