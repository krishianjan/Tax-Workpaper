import { createHash } from "node:crypto";

// 6.9 Season replay. Each timeline event maps to one or more domain commands,
// applied in order. Replay is deterministic and idempotent: the same packet and
// seed produce identical event hashes. The replay must never invent a payment
// that contradicts the final state (tl-25).

export interface TimelineEvent {
  id: string;
  at: string;
  event: string;
  actor: string | null;
  refs: string[];
}

// One event → the commands it drives (e.g. the 8879 signing → two signatures).
const EVENT_COMMANDS: Record<string, string[]> = {
  extension_filed_with_payment: ["fileExtension"],
  client_approved_and_signed_8879: ["signForm8879:taxpayer", "signForm8879:spouse"],
  efile_rejected: ["recordRejection"],
  document_received: ["receiveDocument", "correctFactIfIdentity"],
  efile_accepted_federal: ["acceptEfile:federal", "freezeJurisdiction:federal"],
  efile_accepted_california: ["acceptEfile:california", "freezeJurisdiction:california"],
  federal_balance_paid: ["reconcilePayment:federal"],
  california_refund_issued: ["reconcileRefund:california"],
  quality_review_selected_return: ["openQualityReview"],
  next_year_engagement_started: ["runRollforward"],
  notice_received: ["openNotice"],
};

export function eventToCommands(e: TimelineEvent): string[] {
  return EVENT_COMMANDS[e.event] ?? [];
}

export interface ReplayConflict {
  eventId: string;
  scripted: string;
  finalState: string;
  resolution: "not_applicable" | "refund_expected";
  note: string;
}

/**
 * A scripted "federal balance paid" event conflicts with a final that is an
 * overpayment. Record the conflict; do NOT invent a payment.
 */
export function detectReplayConflict(e: TimelineEvent, finalFederalBalanceCents: bigint): ReplayConflict | null {
  if (e.event === "federal_balance_paid" && finalFederalBalanceCents < 0n) {
    return {
      eventId: e.id,
      scripted: "federal balance paid (direct debit)",
      finalState: `federal overpayment ${(Number(-finalFederalBalanceCents) / 100).toLocaleString()}`,
      resolution: "refund_expected",
      note: "Scripted timeline says a balance was paid, but the workpaper final is an overpayment. The replay records the conflict and expects a refund instead of inventing a payment.",
    };
  }
  return null;
}

/** Deterministic hash over the ordered events — the same input gives the same
 *  output (idempotency check for replay). */
export function replayHash(events: TimelineEvent[]): string {
  const ordered = [...events].sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at.localeCompare(b.at)));
  const material = ordered.map((e) => `${e.id}|${e.event}|${eventToCommands(e).join(",")}`).join("\n");
  return createHash("sha256").update(material).digest("hex");
}

/** Events visible at an as-of instant (seq/time ordered). */
export function eventsAsOf(events: TimelineEvent[], asOfISO: string): TimelineEvent[] {
  const t = Date.parse(asOfISO);
  return events.filter((e) => Date.parse(e.at) <= t).sort((a, b) => a.at.localeCompare(b.at));
}
