import { createHash } from "node:crypto";
import type { ActorRef, Adjustment } from "../change/types";

// The judgment record. Software flags; the CPA decides. A Decision is invalid
// without authority, evidence and (for real choices) at least two options
// (trap 11). It can't stay "approved" after its evidence changes (trap 13).

export type DecisionType =
  | "judgment_call"
  | "election"
  | "due_diligence"
  | "penalty"
  | "scope"
  | "variance_explanation"
  | "completeness_attestation";

export type DecisionStatus = "draft" | "proposed" | "reviewed" | "approved" | "reopened" | "superseded";

export interface DecisionOption {
  id: string;
  label: string;
  consequence: string;
  taxEffectFed: bigint;
  taxEffectCa: bigint;
  method: "rate_estimate" | "what_if_exact";
  adjustmentTemplate?: unknown;
}

export interface Decision {
  id: string;
  issueId: string | null;
  question: string;
  facts: string | null;
  evidenceIds: string[];
  type: DecisionType;
  options: DecisionOption[];
  selectedOptionId: string | null;
  authority: string | null;
  positionStrength: "substantial_authority" | "reasonable_basis_disclosed_8275" | "not_applicable" | null;
  preparedBy: string | null;
  reviewedBy: string | null;
  approvedBy: string | null;
  status: DecisionStatus;
  revision: number;
  supersedesId: string | null;
  dependencyHash: string | null;
  watchedLineKeys: string[];
  /** C6-style gate: weaker evidence explicitly accepted by the CPA (recorded). */
  weakEvidenceAccepted?: boolean;
  /** A follow-up request for the missing evidence has been answered. */
  missingEvidenceResolved?: boolean;
}

const NO_OPTIONS_REQUIRED: DecisionType[] = ["completeness_attestation", "variance_explanation"];

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/** A Decision must have authority, ≥1 evidence, and ≥2 options (except
 *  attestations/explanations). A selected option must be one of the options. */
export function validateDecision(d: Decision): ValidationResult {
  const errors: string[] = [];
  if (!d.authority || d.authority.trim().length === 0) errors.push("Authority (firm rule / citation) is required.");
  if (d.evidenceIds.length < 1) errors.push("At least one piece of evidence is required.");
  if (!NO_OPTIONS_REQUIRED.includes(d.type) && d.options.length < 2)
    errors.push("A judgment needs at least two options (a flag is never a decision).");
  if (d.selectedOptionId && !d.options.some((o) => o.id === d.selectedOptionId))
    errors.push("Selected option is not among the options.");
  return { ok: errors.length === 0, errors };
}

const REVIEWER_ROLES = new Set(["reviewer", "partner", "quality_reviewer"]);
const PREPARER_ROLES = new Set(["preparer", "reviewer", "partner", "quality_reviewer"]);

export type DecisionAction = "propose" | "review" | "approve" | "reopen" | "supersede";

export interface DecisionAuth {
  ok: boolean;
  code?: 403 | 409 | 422;
  error?: string;
  patch?: Partial<Decision>;
}

/** Can a decision advance past `proposed`? Blocked while required evidence is
 *  missing, unless the CPA explicitly accepted weaker evidence (recorded). */
export function canAdvancePastProposed(d: Decision, missingEvidence: boolean): boolean {
  if (!missingEvidence) return true;
  return d.weakEvidenceAccepted === true || d.missingEvidenceResolved === true;
}

export function authorizeDecision(
  action: DecisionAction,
  d: Decision,
  actor: ActorRef,
  opts: { frozen?: boolean; missingEvidence?: boolean } = {},
): DecisionAuth {
  if (opts.frozen) return { ok: false, code: 409, error: "Frozen: the return is filed. Amend on top." };
  if (actor.role === "client" || actor.role === "firm_administrator")
    return { ok: false, code: 403, error: `Role '${actor.role}' cannot act on decisions.` };

  switch (action) {
    case "propose": {
      if (!PREPARER_ROLES.has(actor.role)) return { ok: false, code: 403, error: "Not allowed to propose." };
      const v = validateDecision(d);
      if (!v.ok) return { ok: false, code: 422, error: v.errors.join(" ") };
      if (d.status !== "draft" && d.status !== "proposed")
        return { ok: false, code: 422, error: `Cannot propose from '${d.status}'.` };
      return { ok: true, patch: { status: "proposed", preparedBy: d.preparedBy ?? actor.id } };
    }
    case "review": {
      if (!REVIEWER_ROLES.has(actor.role)) return { ok: false, code: 403, error: "Not allowed to review." };
      if (actor.id === d.preparedBy) return { ok: false, code: 403, error: "A person may not review work they prepared." };
      if (d.status !== "proposed") return { ok: false, code: 422, error: `Cannot review from '${d.status}'.` };
      if (!canAdvancePastProposed(d, opts.missingEvidence ?? false))
        return { ok: false, code: 422, error: "Blocked: required evidence is missing and weaker evidence was not accepted." };
      return { ok: true, patch: { status: "reviewed", reviewedBy: actor.id } };
    }
    case "approve": {
      if (!REVIEWER_ROLES.has(actor.role)) return { ok: false, code: 403, error: "Not allowed to approve." };
      if (actor.id === d.preparedBy) return { ok: false, code: 403, error: "A person may not approve work they prepared." };
      if (actor.id === d.reviewedBy) return { ok: false, code: 403, error: "A person may not both review and approve." };
      if (d.status !== "reviewed") return { ok: false, code: 422, error: "A decision must be reviewed before approval." };
      if (!d.selectedOptionId && !NO_OPTIONS_REQUIRED.includes(d.type))
        return { ok: false, code: 422, error: "Select an option before approving." };
      return { ok: true, patch: { status: "approved" } };
    }
    case "reopen": {
      if (d.status !== "approved") return { ok: false, code: 422, error: "Only an approved decision can be reopened." };
      return { ok: true, patch: { status: "reopened", revision: d.revision + 1 } };
    }
    case "supersede": {
      return { ok: true, patch: { status: "superseded" } };
    }
    default:
      return { ok: false, code: 422, error: "Unknown action." };
  }
}

/** dependencyHash = hash(sorted evidence ids + their content hashes + watched line values). */
export function computeDependencyHash(input: {
  evidenceIds: string[];
  evidenceContentHashes: Record<string, string>;
  watchedLineValues: Record<string, unknown>;
}): string {
  const ev = [...input.evidenceIds].sort().map((id) => `${id}:${input.evidenceContentHashes[id] ?? ""}`);
  const watched = Object.keys(input.watchedLineValues)
    .sort()
    .map((k) => `${k}=${JSON.stringify(input.watchedLineValues[k])}`);
  return createHash("sha256").update(JSON.stringify({ ev, watched })).digest("hex").slice(0, 24);
}

/** An approved decision whose dependency hash no longer matches must reopen. */
export function needsReopen(d: Decision, currentHash: string): boolean {
  return d.status === "approved" && d.dependencyHash !== null && d.dependencyHash !== currentHash;
}

/** Cascade: adjustments created from a decision (same issue) go stale on reopen. */
export function adjustmentsToStale(issueId: string | null, adjustments: Adjustment[]): Adjustment[] {
  if (!issueId) return [];
  return adjustments.filter((a) => a.issueId === issueId && (a.status === "approved" || a.status === "reviewed" || a.status === "proposed"));
}
