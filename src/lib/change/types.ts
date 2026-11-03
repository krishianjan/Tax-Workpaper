import type { Effects } from "../effects";

// Domain types for the Change engine. These are plain objects (DB-decoupled) so
// every rule is a pure function with unit tests. Prisma rows map to these.

export type Mode = "engine" | "final" | "preview";

export type AdjStatus =
  | "draft"
  | "proposed"
  | "reviewed"
  | "approved"
  | "rejected"
  | "reverted"
  | "stale"
  | "absorbed";

export type TargetKind = "line" | "fact" | "document_link" | "page_link";

export interface AdjTarget {
  kind: TargetKind;
  key: string; // line key, ev id, etc.
  baseValue: unknown; // read-only copy of the original
  newValue: unknown;
}

export type AdjMethod = "rate_estimate" | "what_if_exact";

export interface Adjustment {
  id: string;
  issueId: string | null;
  baseVersionId: string;
  targets: AdjTarget[];
  primaryLineKey: string | null;
  rateCategory: string | null;
  caSourceFlag: boolean;
  /** Signed change to the taxable base, used to compute tax effect. */
  baseDeltaCents: bigint;
  effects: Effects; // computed once, at creation, rounded
  method: AdjMethod;
  reason: string;
  evidenceIds: string[];
  preparedBy: string | null;
  reviewedBy: string | null;
  approvedBy: string | null;
  batchId: string | null;
  supersedesId: string | null;
  version: number;
  status: AdjStatus;
  createdAt: string; // ISO
  approvedAt: string | null;
}

/** Statuses visible in each mode. engine shows none; final = approved; preview = final + in-flight. */
export function includedStatuses(mode: Mode): Set<AdjStatus> {
  if (mode === "engine") return new Set();
  if (mode === "final") return new Set<AdjStatus>(["approved"]);
  return new Set<AdjStatus>(["approved", "reviewed", "proposed"]); // preview
}

export interface ActorRef {
  id: string;
  role: string; // preparer | reviewer | partner | quality_reviewer | firm_administrator | client
}
