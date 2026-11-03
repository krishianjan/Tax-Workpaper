// 5.6 Notifications with dedupe. A notification storm is prevented by collapsing
// repeats of the same (user, entity, type) within a 10-minute window.

export interface NotificationT {
  userId: string;
  type: string;
  entityId: string;
  at: string; // ISO
}

const WINDOW_MS = 10 * 60 * 1000;

export function dedupeKey(n: Pick<NotificationT, "userId" | "type" | "entityId">): string {
  return `${n.userId}|${n.type}|${n.entityId}`;
}

/** Should we emit this notification, given recent ones? False if a same-key one
 *  landed within the window. */
export function shouldEmit(candidate: NotificationT, recent: NotificationT[]): boolean {
  const key = dedupeKey(candidate);
  const at = Date.parse(candidate.at);
  return !recent.some((r) => dedupeKey(r) === key && at - Date.parse(r.at) < WINDOW_MS && at - Date.parse(r.at) >= 0);
}

// An email adapter interface — a no-op stub (no keys in this build).
export interface EmailAdapter {
  send(to: string, subject: string, body: string): Promise<void>;
}
export const noopEmail: EmailAdapter = {
  async send() {
    /* no-op */
  },
};
