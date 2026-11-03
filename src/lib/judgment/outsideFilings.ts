import type { PacketModel } from "../packet/model";

// 4.6 Outside filings register. Each row: what, who files, whether it is in this
// engagement, and its status. Derived from related returns, engine diagnostics
// and prior-preparer open items — not a hardcoded list.

export interface OutsideFilingRow {
  id: string;
  filing: string;
  whoFiles: string;
  inEngagement: boolean;
  status: "identified" | "client_to_file" | "other_firm" | "in_return" | "n_a";
  basis: string;
}

export function deriveOutsideFilings(model: PacketModel): OutsideFilingRow[] {
  const rows: OutsideFilingRow[] = [];
  const household = model.raw.household as Record<string, unknown>;
  const related = Array.isArray(household.related_returns) ? (household.related_returns as Array<Record<string, unknown>>) : [];

  // Engine diagnostics that imply an outside/separate filing.
  const v3 = model.versionById.get("v3");
  for (const d of v3?.diagnostics ?? []) {
    if (d.code === "FBAR_OUTSIDE_RETURN")
      rows.push({ id: "fbar", filing: "FinCEN Form 114 (FBAR)", whoFiles: "Taxpayer (BSA e-file)", inEngagement: false, status: "client_to_file", basis: "Foreign account > $10,000; filed separately, due 10/15." });
  }
  // Form 8938 lives in the return when present.
  if ((v3?.lines ?? []).some((l) => /F8938/.test(l.key)))
    rows.push({ id: "f8938", filing: "Form 8938 (specified foreign assets)", whoFiles: "This firm", inEngagement: true, status: "in_return", basis: "Reported with the return." });

  // Prior-preparer open item: 2023 Form 3520 (foreign inheritance).
  const openItems = (((model.raw.prior_years as Record<string, unknown>).prior_preparer_workpaper ?? {}) as Record<string, unknown>)
    .open_items_left_by_prior_preparer;
  if (Array.isArray(openItems) && openItems.some((i) => /3520/.test(String(i))))
    rows.push({ id: "f3520", filing: "Form 3520 (2023 foreign inheritance)", whoFiles: "Taxpayer / this firm", inEngagement: false, status: "identified", basis: "Prior-preparer open item; inheritance > $100,000 — confirm filing." });

  // Related returns.
  for (const r of related) {
    const who = String(r.who ?? "");
    const ret = String(r.return ?? "");
    if (/1120-S/i.test(ret))
      rows.push({ id: "woodworks", filing: `${who}: Form 1120-S + Oregon composite`, whoFiles: String(r.prepared_by ?? "Other firm"), inEngagement: false, status: "other_firm", basis: ret });
    else if (/1065/i.test(ret))
      rows.push({ id: "ridgeline", filing: `${who}: Form 1065 + Arizona composite`, whoFiles: String(r.prepared_by ?? "Other firm"), inEngagement: false, status: "other_firm", basis: ret });
    else if (/1040/i.test(ret))
      rows.push({ id: "ada1040", filing: `${who}: own Form 1040`, whoFiles: String(r.prepared_by ?? "Taxpayer"), inEngagement: false, status: "other_firm", basis: ret });
  }

  // 1099-NEC the business must file (contractors paid, none filed).
  if ((v3?.diagnostics ?? []).some((d) => d.code === "FORM_1099_FILING"))
    rows.push({ id: "1099nec", filing: "1099-NEC by Lindqvist Studio", whoFiles: "Client (business)", inEngagement: false, status: "client_to_file", basis: "Contractors ≥ $600 paid; none filed (call-01)." });

  // Texas — no individual income tax.
  rows.push({ id: "tx", filing: "Texas individual income tax", whoFiles: "—", inEngagement: false, status: "n_a", basis: "Texas has no individual income tax." });

  return rows;
}

export function outsideFilingsResolved(rows: OutsideFilingRow[]): boolean {
  // Resolved = every identified filing has an owner decision (not left 'identified').
  return rows.every((r) => r.status !== "identified");
}
