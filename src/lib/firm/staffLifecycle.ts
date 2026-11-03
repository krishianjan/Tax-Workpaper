// 7.4 Staff lifecycle. Deactivating staff must force their open items to be
// reassigned (blocked until done) and revoke their sessions. active_from is
// enforced before any action (see people/permissions.can). Clearance changes
// are logged (Event). Pure helpers here; the DB writes live in firm-actions.

export interface OpenItemRef {
  kind: string; // "assignment" | "review_note" | "question" | ...
  id: string;
  scope?: string;
}

export interface DeactivateDecision {
  allow: boolean;
  mustReassign: OpenItemRef[];
  reason: string;
}

/** A staff member may be deactivated only once their open items are reassigned. */
export function canDeactivate(staffId: string, openItems: OpenItemRef[]): DeactivateDecision {
  if (openItems.length > 0) {
    return {
      allow: false,
      mustReassign: openItems,
      reason: `${staffId} still holds ${openItems.length} open item(s); reassign them first.`,
    };
  }
  return { allow: true, mustReassign: [], reason: "ok" };
}

export interface StaffActiveState {
  staffId: string;
  active: boolean;
  activeFrom: string | null; // ISO
  deactivatedAt: string | null; // ISO
}

/** Is the staff member allowed to act at `now`: active, past active_from, not deactivated. */
export function isActiveAt(state: StaffActiveState, now: string): boolean {
  if (!state.active) return false;
  if (state.activeFrom && Date.parse(now) < Date.parse(state.activeFrom)) return false;
  if (state.deactivatedAt && Date.parse(now) >= Date.parse(state.deactivatedAt)) return false;
  return true;
}

export interface ClearanceChange {
  staffId: string;
  from: boolean;
  to: boolean;
  by: string;
  at: string;
}

/** The Event payload for a clearance change (always logged). */
export function clearanceChangeEvent(c: ClearanceChange): {
  type: string;
  entityKind: string;
  entityId: string;
  payload: Record<string, unknown>;
} {
  return {
    type: "staff.clearance_changed",
    entityKind: "staff",
    entityId: c.staffId,
    payload: { from: c.from, to: c.to, by: c.by, at: c.at },
  };
}
