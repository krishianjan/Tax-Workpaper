// 5.6 Deadlines. Stored in UTC, displayed in firm-local time (America/Chicago,
// from the firm's Austin address — recorded assumption). Status is computed, and
// missed internal dates are shown honestly.

export const FIRM_TZ = "America/Chicago";

export type DeadlineStatus = "met" | "overdue" | "due_soon" | "upcoming";

export interface DeadlineT {
  what: string;
  dateUtc: string; // ISO (stored UTC)
  metEventSeq?: number | null;
}

const DAY = 86_400_000;

export function deadlineStatus(d: DeadlineT, nowUtc: string): DeadlineStatus {
  if (d.metEventSeq != null) return "met";
  const now = Date.parse(nowUtc);
  const due = Date.parse(d.dateUtc);
  if (now > due) return "overdue";
  if (due - now <= 7 * DAY) return "due_soon";
  return "upcoming";
}

/** Display a stored UTC instant in the firm's local time zone. */
export function formatFirmLocal(dateUtc: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: FIRM_TZ,
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(dateUtc));
  } catch {
    return dateUtc;
  }
}
