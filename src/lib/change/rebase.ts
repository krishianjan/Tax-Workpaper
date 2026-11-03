import type { PacketModel } from "../packet/model";
import type { Adjustment, AdjStatus } from "./types";
import { engineValue } from "./effective";

// When a newer engine version arrives, each active adjustment whose
// baseVersionId is older must be processed against the new engine value of its
// primary line:
//   new == adjustment.newValue  -> absorbed (engine already fixed it)
//   new == old base value       -> rebase (keep the effect, move the base)
//   otherwise                   -> stale (exclude from final; show three values)

export type RebaseOutcome = "unchanged" | "absorbed" | "rebased" | "stale";

export interface RebaseResult {
  outcome: RebaseOutcome;
  oldBase: unknown;
  newEngine: unknown;
  adjustmentNew: unknown;
  patch?: Partial<Adjustment>;
  note: string;
}

function eq(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function rebaseAdjustment(model: PacketModel, adj: Adjustment, newVersionId: string): RebaseResult {
  if (adj.baseVersionId === newVersionId) {
    return { outcome: "unchanged", oldBase: null, newEngine: null, adjustmentNew: null, note: "Already on the current version." };
  }
  const lineKey = adj.primaryLineKey ?? adj.targets.find((t) => t.kind === "line")?.key ?? null;
  if (!lineKey) {
    return { outcome: "unchanged", oldBase: null, newEngine: null, adjustmentNew: null, note: "No line target to rebase." };
  }
  const target = adj.targets.find((t) => t.kind === "line" && t.key === lineKey)!;
  const oldBase = target.baseValue;
  const newEngine = engineValue(model, newVersionId, lineKey);
  const adjustmentNew = target.newValue;

  if (eq(newEngine, adjustmentNew)) {
    return {
      outcome: "absorbed",
      oldBase,
      newEngine,
      adjustmentNew,
      patch: { status: "absorbed" as AdjStatus },
      note: `Engine ${newVersionId} now equals the adjustment's value (${JSON.stringify(newEngine)}); the engine fixed it. Closed.`,
    };
  }
  if (eq(newEngine, oldBase)) {
    const newTargets = adj.targets.map((t) => (t === target ? { ...t, baseValue: newEngine } : t));
    return {
      outcome: "rebased",
      oldBase,
      newEngine,
      adjustmentNew,
      patch: { baseVersionId: newVersionId, targets: newTargets },
      note: `Engine base unchanged (${JSON.stringify(newEngine)}); re-based onto ${newVersionId}, effect kept.`,
    };
  }
  return {
    outcome: "stale",
    oldBase,
    newEngine,
    adjustmentNew,
    patch: { status: "stale" as AdjStatus },
    note: `Engine ${newVersionId} moved the base to ${JSON.stringify(newEngine)} (was ${JSON.stringify(oldBase)}, adjustment set ${JSON.stringify(adjustmentNew)}). Marked stale; excluded from final pending review.`,
  };
}
