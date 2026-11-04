import type { PacketModel } from "../packet/model";
import type { Adjustment } from "../change/types";
import { returnTotals } from "../change/effective";
import { toChangeMode, type RecordMode } from "./mode";
import { tieOut, type TieOut } from "./tieout";
import { toCents, type Cents } from "../money";
import { line } from "../checks/helpers";

// Record 1 — Return summary vs last year. 2024 (prior return) vs 2025 engine vs
// the selected mode (final/filed/amendment). Tax, payments and balance in the
// non-engine modes carry the Σ of approved effects; AGI and taxable income are
// engine-level (our rate adjustments change tax, not AGI). The engine column
// ties to the F1040 summary lines.

export interface SwingRow {
  label: string;
  lineKey: string;
  prior: Cents | null;
  engine: Cents | null;
  current: Cents | null;
  swing: Cents | null; // current − prior
}

function fed(model: PacketModel, versionId: string, path: string): Cents | null {
  const summary = model.versionById.get(versionId)?.summary as Record<string, Record<string, unknown>> | undefined;
  return toCents(summary?.federal?.[path]);
}

function prior(model: PacketModel, key: string): Cents | null {
  const lines = ((model.raw.prior_years as Record<string, unknown>).return_2024 as Record<string, unknown> | undefined)
    ?.lines as Record<string, unknown> | undefined;
  return toCents(lines?.[key]);
}

export interface SummaryVsLastYear {
  rows: SwingRow[];
  tieOuts: TieOut[];
}

export function buildSummaryVsLastYear(model: PacketModel, versionId: string, mode: RecordMode, adjustments: Adjustment[]): SummaryVsLastYear {
  const t = returnTotals(model, versionId, toChangeMode(mode), adjustments);
  const engineTax = fed(model, versionId, "total_tax");
  const enginePay = fed(model, versionId, "payments");
  const engineBal = fed(model, versionId, "balance_due");

  const agi = fed(model, versionId, "agi");
  const ti = fed(model, versionId, "taxable_income");

  const rows: SwingRow[] = [
    { label: "Adjusted gross income", lineKey: "F1040.11", prior: prior(model, "F1040.11"), engine: agi, current: agi, swing: diff(agi, prior(model, "F1040.11")) },
    { label: "Taxable income", lineKey: "F1040.15", prior: prior(model, "F1040.15"), engine: ti, current: ti, swing: diff(ti, prior(model, "F1040.15")) },
    { label: "Total tax", lineKey: "F1040.24", prior: prior(model, "F1040.24"), engine: engineTax, current: t.taxFed, swing: diff(t.taxFed, prior(model, "F1040.24")) },
    { label: "Payments", lineKey: "F1040.33", prior: prior(model, "F1040.33"), engine: enginePay, current: t.payFed, swing: diff(t.payFed, prior(model, "F1040.33")) },
    { label: "Balance due / (refund)", lineKey: "F1040.37", prior: priorBalance(model), engine: engineBal, current: t.balanceFed, swing: diff(t.balanceFed, priorBalance(model)) },
  ];

  // The engine column must equal the F1040 summary lines.
  const tieOuts: TieOut[] = [
    tieOut("Total tax (engine)", "F1040.24", engineTax ?? 0n, toCents(line(model, versionId, "F1040.24")?.value)),
    tieOut("Payments (engine)", "F1040.33", enginePay ?? 0n, toCents(line(model, versionId, "F1040.33")?.value)),
    tieOut("AGI (engine)", "F1040.11", agi ?? 0n, toCents(line(model, versionId, "F1040.11")?.value)),
  ];

  return { rows, tieOuts };
}

function diff(a: Cents | null, b: Cents | null): Cents | null {
  if (a === null || b === null) return null;
  return a - b;
}

function priorBalance(model: PacketModel): Cents | null {
  // 2024 balance due = total tax − total payments (negative = refund).
  const tax = prior(model, "F1040.24");
  const pay = prior(model, "F1040.33");
  if (tax === null || pay === null) return null;
  return tax - pay;
}
