import type { PacketModel } from "../packet/model";
import type { Adjustment } from "../change/types";
import { toCents } from "../money";

// 6.8 Carry everything forward with provenance; plan 2026. Carryovers come from
// v3 carryovers_out, tagged with the approved final adjustments that bear on
// them. Next-year expected documents exclude sources that ended in 2025.

export interface CarryoverForward {
  key: string;
  jurisdiction: "federal" | "california";
  amountCents: bigint;
  provenance: { version: string; source: string; adjustmentIds: string[] };
}

export function carryoversForward(model: PacketModel, approvedAdjustments: Adjustment[]): CarryoverForward[] {
  const v3 = model.versionById.get("v3");
  const co = (v3 as unknown as { carryovers_out?: Record<string, unknown> })?.carryovers_out;
  if (!co) return [];
  const adjIds = approvedAdjustments.filter((a) => a.status === "approved").map((a) => a.id);
  const out: CarryoverForward[] = [];
  const push = (key: string, jur: "federal" | "california", v: unknown) => {
    const c = toCents(v);
    if (c === null) return;
    out.push({ key, jurisdiction: jur, amountCents: c, provenance: { version: "v3", source: "carryovers_out", adjustmentIds: adjIds } });
  };
  for (const [k, v] of Object.entries((co.federal ?? {}) as Record<string, unknown>)) if (typeof v === "number") push(k, "federal", v);
  const ca = (co.california ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(ca)) {
    if (typeof v === "number") push(k, "california", v);
    else if (k === "depreciation_basis_differences" && v && typeof v === "object")
      for (const [ak, av] of Object.entries(v as Record<string, unknown>)) push(`ca_depr_basis_${ak}`, "california", av);
  }
  return out;
}

/** Issuers whose source ended in 2025 (loan paid off, property sold, employment
 *  ended via a stock-plan from a former employer). Derived, not hardcoded. */
export function derivedEndedIssuers(model: PacketModel): Set<string> {
  const ended = new Set<string>();
  for (const d of model.documents) {
    if (!d.issuer) continue;
    if (d.document_type === "payoff_statement" || d.document_type === "closing_statement_seller") ended.add(d.issuer);
    if (d.document_type === "stock_plan_supplement") ended.add(d.issuer); // RSUs from a former employer
  }
  return ended;
}

export interface ExpectedDoc2026 {
  issuer: string;
  documentType: string;
  status: "expected" | "ended";
  reason?: string;
}

const RECURRING_TYPES = ["W-2", "1099-INT", "1099-composite", "1099-NEC", "1099-R", "K-1-1065", "K-1-1120S", "1098", "rental_owner_statement"];

export function expectedDocuments2026(model: PacketModel): ExpectedDoc2026[] {
  const ended = derivedEndedIssuers(model);
  const seen = new Set<string>();
  const out: ExpectedDoc2026[] = [];
  for (const d of model.documents) {
    if (!RECURRING_TYPES.includes(d.document_type) || !d.issuer) continue;
    const key = `${d.issuer}|${d.document_type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (ended.has(d.issuer)) {
      out.push({ issuer: d.issuer, documentType: d.document_type, status: "ended", reason: "Source ended in 2025 (sold / paid off / employment ended)." });
    } else {
      out.push({ issuer: d.issuer, documentType: d.document_type, status: "expected" });
    }
  }
  return out;
}

export interface EstimateInstallment {
  date: string;
  amountCents: bigint;
}

/** 2026 estimates: federal 110% of 2025 final total tax in 4 equal installments;
 *  CA 30/40/30 of 110% of 2025 CA tax, CA-source only. */
export function estimates2026(model: PacketModel, finalFedTotalTaxCents: bigint, finalCaTaxCents: bigint) {
  const plan = (model.raw as Record<string, unknown>).planning_reference_2026 as Record<string, unknown> | undefined;
  const fedDates = (plan?.federal_estimate_due_dates ?? []) as string[];
  const caDates = (plan?.california_estimate_due_dates ?? []) as string[];
  const caPcts = (plan?.california_installment_percentages ?? [0.3, 0.4, 0.3]) as number[];

  const fedSafeHarbor = (finalFedTotalTaxCents * 110n) / 100n;
  const fedPer = fedSafeHarbor / BigInt(fedDates.length || 4);
  const federal: EstimateInstallment[] = fedDates.map((date) => ({ date, amountCents: fedPer }));

  const caSafeHarbor = (finalCaTaxCents * 110n) / 100n;
  const california: EstimateInstallment[] = caDates.map((date, i) => ({
    date,
    amountCents: BigInt(Math.round(Number(caSafeHarbor) * (caPcts[i] ?? 0))),
  }));

  return { federal, california, note: "California taxes only California-source income after the 2025 move." };
}
