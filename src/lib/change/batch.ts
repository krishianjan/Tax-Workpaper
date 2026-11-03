// Bulk actions + undo (pure planning; the server action applies in one DB
// transaction and writes compensating events for undo — never deletes).

export const BATCH_CAP = 500;

export interface BatchItemPlan<T> {
  ref: T;
  ok: boolean;
  reason?: string;
}

export interface BatchPlan<T> {
  applicable: T[];
  blocked: Array<{ ref: T; reason: string }>;
  overCap: boolean;
  size: number;
}

export function planBatch<T>(items: Array<BatchItemPlan<T>>): BatchPlan<T> {
  const overCap = items.length > BATCH_CAP;
  const usable = overCap ? items.slice(0, BATCH_CAP) : items;
  return {
    applicable: usable.filter((i) => i.ok).map((i) => i.ref),
    blocked: usable.filter((i) => !i.ok).map((i) => ({ ref: i.ref, reason: i.reason ?? "blocked" })),
    overCap,
    size: items.length,
  };
}

export interface UndoItemState {
  ref: string;
  laterApproved?: boolean;
  superseded?: boolean;
  dependedOn?: boolean;
  frozen?: boolean;
}

export interface UndoPlan {
  ok: boolean;
  blockers: Array<{ ref: string; reason: string }>;
}

/** Undo is blocked if any item was later approved, superseded, depended on, or frozen. */
export function canUndoBatch(items: UndoItemState[]): UndoPlan {
  const blockers: Array<{ ref: string; reason: string }> = [];
  for (const i of items) {
    if (i.frozen) blockers.push({ ref: i.ref, reason: "return is frozen (filed)" });
    else if (i.laterApproved) blockers.push({ ref: i.ref, reason: "item was approved after the batch" });
    else if (i.superseded) blockers.push({ ref: i.ref, reason: "item was superseded" });
    else if (i.dependedOn) blockers.push({ ref: i.ref, reason: "a decision or adjustment depends on it" });
  }
  return { ok: blockers.length === 0, blockers };
}
