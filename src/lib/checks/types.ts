import { createHash } from "node:crypto";
import type { PacketModel } from "../packet/model";

// Each check is a pure function (ctx) => CheckResult[], generic over the data,
// with its own unit tests. ctx holds the normalized packet plus a version id.
// A check never recomputes tax; it compares the engine to a SECOND SOURCE
// (patch v1.1 §2). Arithmetic re-adds (SUM_RECOMPUTE) are a separate category.

export type CheckStatus = "pass" | "fail" | "warn" | "info";

export type SecondSource =
  | "page_text"
  | "supplemental_statement"
  | "agency_transcript"
  | "prior_year"
  | "deposit_detail"
  | "paystub"
  | "residency"
  | "client_answer"
  | "identity_document"
  | "engine_internal" // arithmetic integrity only
  | "engine_diagnostic";

export type Area =
  | "Arithmetic integrity"
  | "Evidence"
  | "Wages & income"
  | "Schedule C"
  | "Capital gains & 8949"
  | "Digital assets"
  | "Payments"
  | "State allocation"
  | "Identity"
  | "Prior year"
  | "Completeness"
  | "Diagnostics";

export interface CheckContext {
  model: PacketModel;
  versionId: string;
}

export interface CheckResult {
  id: string; // stable: sha256(checkId + sorted primary refs)
  checkId: string;
  title: string;
  area: Area;
  secondSource: SecondSource;
  status: CheckStatus;
  expected?: unknown;
  actual?: unknown;
  delta?: bigint | null; // cents, signed (correct - engine) on the primary line
  taxEffectFed?: bigint | null; // cents — change in tax liability
  taxEffectCa?: bigint | null;
  paymentEffectFed?: bigint | null; // cents — change in payments/credits (1:1)
  paymentEffectCa?: bigint | null;
  rateCategory?: string | null;
  refs: string[];
  explanation: string;
  suggestedFix?: unknown;
  judgment?: boolean; // true => not auto-applied to the preview
}

export interface Check {
  id: string;
  title: string;
  area: Area;
  secondSource: SecondSource;
  run(ctx: CheckContext): CheckResult[];
}

/** Stable finding id = sha256(checkId + sorted primary refs), truncated. */
export function findingId(checkId: string, refs: string[]): string {
  const sorted = [...new Set(refs)].sort();
  return createHash("sha256").update(checkId + "|" + sorted.join(",")).digest("hex").slice(0, 16);
}

/** Helper to build a result with a stable id from its primary refs. */
export function makeFinding(
  base: Omit<CheckResult, "id"> & { primaryRefs?: string[] },
): CheckResult {
  const { primaryRefs, ...rest } = base;
  return { id: findingId(rest.checkId, primaryRefs ?? rest.refs), ...rest };
}
