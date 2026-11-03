import type { PacketModel } from "../packet/model";
import type { Adjustment } from "../change/types";
import { buildCrosswalk, type CrosswalkEntry } from "../crosswalk";
import { effective } from "../change/effective";
import { toCents } from "../money";

// 4.1 Swings vs last year. Compare 2024 to the FINAL (post-adjustment) value —
// and show the engine value too. A swing that an approved adjustment removes
// disappears from the list. Flag if change > pct AND > amount (firm standards).
// Unmatched 2024 lines each need a disposition.

export interface Swing {
  key2024: string;
  key2025: string;
  old: bigint;
  engine: bigint;
  final: bigint;
  changeFromEngine: bigint;
  changeFromFinal: bigint;
  pctFinal: number;
  flagged: boolean;
}

function thresholds(model: PacketModel): { pct: number; amtCents: bigint } {
  const vr = ((model.raw.firm as Record<string, unknown>).starter_standards as Record<string, unknown>)
    ?.variance_review as Record<string, unknown> | undefined;
  const pct = typeof vr?.flag_if_change_over_percent === "number" ? vr.flag_if_change_over_percent : 10;
  const amt = typeof vr?.and_over_amount === "number" ? vr.and_over_amount : 1000;
  return { pct, amtCents: BigInt(Math.round(amt * 100)) };
}

export function computeSwings(model: PacketModel, versionId: string, adjustments: Adjustment[]): Swing[] {
  const { pct, amtCents } = thresholds(model);
  const prior = (model.raw.prior_years as Record<string, unknown>).return_2024 as Record<string, unknown>;
  const lines2024 = (prior?.lines ?? {}) as Record<string, unknown>;
  const out: Swing[] = [];

  for (const e of buildCrosswalk(model, versionId)) {
    if (e.status === "no_counterpart" || !e.key2025) continue;
    const old = toCents(lines2024[e.key2024]);
    const engine = toCents(effective(model, versionId, e.key2025, "engine", adjustments).value);
    const final = toCents(effective(model, versionId, e.key2025, "final", adjustments).value);
    if (old === null || final === null || engine === null) continue;

    const change = final - old;
    const absChange = change < 0n ? -change : change;
    const pctFinal = old === 0n ? Infinity : (Number(absChange) / Math.abs(Number(old))) * 100;
    out.push({
      key2024: e.key2024,
      key2025: e.key2025,
      old,
      engine,
      final,
      changeFromEngine: final - engine,
      changeFromFinal: change,
      pctFinal,
      flagged: pctFinal > pct && absChange > amtCents,
    });
  }
  return out.sort((a, b) => {
    const am = a.changeFromFinal < 0n ? -a.changeFromFinal : a.changeFromFinal;
    const bm = b.changeFromFinal < 0n ? -b.changeFromFinal : b.changeFromFinal;
    return am === bm ? 0 : am > bm ? -1 : 1;
  });
}

export function flaggedSwings(swings: Swing[]): Swing[] {
  return swings.filter((s) => s.flagged);
}

/** Flagged swings without a variance_explanation decision block the return. */
export function unexplainedFlagged(swings: Swing[], explainedKeys: Set<string>): Swing[] {
  return swings.filter((s) => s.flagged && !explainedKeys.has(s.key2025));
}

/** Unmatched prior-year lines each need a disposition (4.1). */
export function unmatchedPriorYearLines(model: PacketModel, versionId: string): CrosswalkEntry[] {
  return buildCrosswalk(model, versionId).filter((e) => e.status === "no_counterpart");
}
