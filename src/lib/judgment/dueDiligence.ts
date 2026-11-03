import type { ActorRef } from "../change/types";

// 4.4 Due diligence (Form 8867). The preparer completes the checklist; a
// reviewer (≠ preparer) signs. A credit is BLOCKED while a linked issue is open
// (Theo CTC is blocked by the open SSN-identity issue — trap 15).

export type Credit = "CTC" | "ODC" | "AOTC" | "EIC" | "HOH";

export interface DDItem {
  question: string;
  answer: string | null;
  evidenceIds: string[];
  answeredBy: string | null;
}

export type DDStatus = "blocked" | "incomplete" | "complete" | "not_applicable" | "signed";

export interface DueDiligenceRecord {
  credit: Credit;
  personId: string | null;
  items: DDItem[];
  blockedByIssueIds: string[];
  notApplicableReason?: string;
  signedBy?: string | null;
  completedBy?: string | null;
}

/** Compute status. Open blockers dominate; then completeness of the checklist. */
export function computeDDStatus(dd: DueDiligenceRecord, openIssueIds: Set<string>): DDStatus {
  if (dd.notApplicableReason) return "not_applicable";
  const blocked = dd.blockedByIssueIds.some((id) => openIssueIds.has(id));
  if (blocked) return "blocked";
  const allAnswered = dd.items.length > 0 && dd.items.every((i) => i.answer !== null && i.answer.trim() !== "");
  if (!allAnswered) return "incomplete";
  if (dd.signedBy) return "signed";
  return "complete";
}

export interface SignResult {
  ok: boolean;
  code?: 403 | 422;
  error?: string;
}

/** A reviewer (not the preparer) signs a completed, unblocked checklist. */
export function canSignDueDiligence(dd: DueDiligenceRecord, actor: ActorRef, openIssueIds: Set<string>): SignResult {
  const status = computeDDStatus(dd, openIssueIds);
  if (status === "blocked") return { ok: false, code: 422, error: "Blocked by an open issue; resolve it first." };
  if (status === "incomplete") return { ok: false, code: 422, error: "Checklist is not complete." };
  if (status === "not_applicable") return { ok: false, code: 422, error: "Not applicable; nothing to sign." };
  if (!(actor.role === "reviewer" || actor.role === "partner" || actor.role === "quality_reviewer"))
    return { ok: false, code: 403, error: "Only a reviewer or partner may sign Form 8867." };
  if (actor.id === dd.completedBy) return { ok: false, code: 403, error: "The preparer who completed it may not sign it." };
  return { ok: true };
}
