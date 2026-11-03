import type { PacketModel } from "../packet/model";
import type { Adjustment, Mode } from "./types";
import { includedStatuses } from "./types";
import type { Effects } from "../effects";
import { ZERO_EFFECTS, addEffects, balanceFed, balanceCa } from "../effects";
import { toCents } from "../money";

// effective() is the heart of the system. It never mutates the packet; it layers
// approved (final) or in-flight (preview) adjustments over the engine base.
//
// Rules enforced here:
//  - adjustments apply in approvedAt (then createdAt) order;
//  - a superseded adjustment is excluded when its superseder is active;
//  - two active adjustments on the same target with no supersede link => conflict;
//  - tax effect is counted ONCE per adjustment (never re-added on derived lines).

/** Adjustments active in a mode: right status, not superseded by another active one. */
export function activeAdjustments(all: Adjustment[], mode: Mode): Adjustment[] {
  const allowed = includedStatuses(mode);
  const inMode = all.filter((a) => allowed.has(a.status));
  const supersededIds = new Set(inMode.map((a) => a.supersedesId).filter((x): x is string => Boolean(x)));
  return inMode.filter((a) => !supersededIds.has(a.id));
}

function orderKey(a: Adjustment): string {
  return (a.approvedAt ?? "9999") + "|" + a.createdAt + "|" + a.id;
}

export interface Conflict {
  targetKey: string;
  adjustmentIds: string[];
}

/** Two active, non-superseding adjustments on the same line target. */
export function detectConflicts(all: Adjustment[], mode: Mode): Conflict[] {
  const active = activeAdjustments(all, mode);
  const byTarget = new Map<string, Adjustment[]>();
  for (const a of active) {
    for (const t of a.targets) {
      if (t.kind !== "line") continue;
      const arr = byTarget.get(t.key) ?? [];
      arr.push(a);
      byTarget.set(t.key, arr);
    }
  }
  const conflicts: Conflict[] = [];
  for (const [key, adjs] of byTarget) {
    if (adjs.length < 2) continue;
    // If one supersedes the others it wouldn't be active; remaining >1 => conflict.
    conflicts.push({ targetKey: key, adjustmentIds: adjs.map((a) => a.id).sort() });
  }
  return conflicts;
}

/** Raw engine value of a line (base version). */
export function engineValue(model: PacketModel, versionId: string, lineKey: string): unknown {
  return model.lineByVersionKey.get(versionId)?.get(lineKey)?.value ?? null;
}

export interface EffectiveValue {
  value: unknown;
  source: "engine" | "adjustment";
  adjustmentId: string | null;
  includes: string[]; // adjustment ids that touched this line (for "includes A-07")
}

/** The effective value of a line under a mode. */
export function effective(
  model: PacketModel,
  versionId: string,
  lineKey: string,
  mode: Mode,
  all: Adjustment[],
): EffectiveValue {
  const base = engineValue(model, versionId, lineKey);
  if (mode === "engine") return { value: base, source: "engine", adjustmentId: null, includes: [] };

  const active = activeAdjustments(all, mode)
    .filter((a) => a.targets.some((t) => t.kind === "line" && t.key === lineKey))
    .sort((x, y) => orderKey(x).localeCompare(orderKey(y)));

  if (active.length === 0) return { value: base, source: "engine", adjustmentId: null, includes: [] };

  const last = active[active.length - 1];
  const target = last.targets.find((t) => t.kind === "line" && t.key === lineKey)!;
  return {
    value: target.newValue,
    source: "adjustment",
    adjustmentId: last.id,
    includes: active.map((a) => a.id),
  };
}

/** Σ of each active adjustment's effect, counted ONCE (not per line). */
export function totalEffects(all: Adjustment[], mode: Mode): Effects {
  if (mode === "engine") return ZERO_EFFECTS;
  return activeAdjustments(all, mode).reduce((acc, a) => addEffects(acc, a.effects), ZERO_EFFECTS);
}

export interface Totals {
  taxFed: bigint;
  taxCa: bigint;
  payFed: bigint;
  payCa: bigint;
  balanceFed: bigint;
  balanceCa: bigint;
}

function summaryCents(model: PacketModel, versionId: string, path: string[]): bigint {
  let cur: unknown = model.versionById.get(versionId)?.summary;
  for (const p of path) {
    if (cur && typeof cur === "object" && p in cur) cur = (cur as Record<string, unknown>)[p];
    else return 0n;
  }
  return toCents(cur) ?? 0n;
}

/**
 * Return totals in a mode = base summary + Σ adjustment effects.
 * federal: tax = total_tax + Σtaxfed ; payments = payments + Σpayfed ;
 * balance = balance_due + (Σtaxfed − Σpayfed).
 */
export function returnTotals(model: PacketModel, versionId: string, mode: Mode, all: Adjustment[]): Totals {
  const eff = totalEffects(all, mode);
  const fedTaxBase = summaryCents(model, versionId, ["federal", "total_tax"]);
  const fedPayBase = summaryCents(model, versionId, ["federal", "payments"]);
  const fedBalBase = summaryCents(model, versionId, ["federal", "balance_due"]);
  const caTaxBase = summaryCents(model, versionId, ["california", "total_tax"]);
  const caPayBase = summaryCents(model, versionId, ["california", "payments"]);
  const caBalBase = summaryCents(model, versionId, ["california", "balance_due"]);
  return {
    taxFed: fedTaxBase + eff.taxFed,
    taxCa: caTaxBase + eff.taxCa,
    payFed: fedPayBase + eff.payFed,
    payCa: caPayBase + eff.payCa,
    balanceFed: fedBalBase + balanceFed(eff),
    balanceCa: caBalBase + balanceCa(eff),
  };
}
