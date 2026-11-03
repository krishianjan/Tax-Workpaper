import type { PacketModel } from "../packet/model";
import type { Adjustment, Mode } from "./types";
import { effective, engineValue, returnTotals } from "./effective";

// Compare any two of: engine v1/v2/v3, final, preview. Each changed line gets a
// CAUSE: engine recompute (with the trigger document that superseded another),
// an adjustment id, or both. Engine-vs-engine diffs are verified against the
// newer version's changes_from_previous.

export type Side = string; // "v1" | "v2" | "v3" | "final" | "preview"

function baseVersionOf(model: PacketModel, side: Side): string {
  if (model.versionById.has(side)) return side;
  return model.versions[model.versions.length - 1]?.version ?? "v3";
}

function modeOf(model: PacketModel, side: Side): Mode {
  if (model.versionById.has(side)) return "engine";
  return side === "preview" ? "preview" : "final";
}

function valueOf(model: PacketModel, side: Side, key: string, adjustments: Adjustment[]): unknown {
  const mode = modeOf(model, side);
  if (mode === "engine") return engineValue(model, side, key);
  return effective(model, baseVersionOf(model, side), key, mode, adjustments).value;
}

function eq(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return a === b;
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export type Cause = "engine" | "adjustment" | "both" | "unknown";

export interface LineDiff {
  key: string;
  label: string | null;
  aValue: unknown;
  bValue: unknown;
  cause: Cause;
  adjustmentIds: string[];
  trigger: string | null; // e.g. "D31 superseded D30"
  changelogMatch: boolean | null; // for engine-vs-engine
}

export interface CompareResult {
  a: Side;
  b: Side;
  lineDiffs: LineDiff[];
  changelogMismatches: string[];
  summary: {
    taxFedA: bigint; taxFedB: bigint; taxCaA: bigint; taxCaB: bigint;
    payFedA: bigint; payFedB: bigint; payCaA: bigint; payCaB: bigint;
    balFedA: bigint; balFedB: bigint; balCaA: bigint; balCaB: bigint;
  };
}

function allLineKeys(model: PacketModel, a: Side, b: Side): string[] {
  const keys = new Set<string>();
  for (const side of [a, b]) {
    const v = model.versionById.get(baseVersionOf(model, side));
    for (const ln of v?.lines ?? []) keys.add(ln.key);
  }
  return [...keys];
}

function triggerFor(model: PacketModel, newerVersion: string): string | null {
  const v = model.versionById.get(newerVersion);
  if (!v) return null;
  if (v.documents_superseded.length) return `${v.documents_superseded.join(", ")} superseded; ${v.trigger ?? ""}`.trim();
  return v.trigger ?? null;
}

export function compareSides(model: PacketModel, a: Side, b: Side, adjustments: Adjustment[]): CompareResult {
  const keys = allLineKeys(model, a, b);
  const baseA = baseVersionOf(model, a);
  const baseB = baseVersionOf(model, b);
  const modeA = modeOf(model, a);
  const modeB = modeOf(model, b);
  const bothEngine = modeA === "engine" && modeB === "engine";

  const lineDiffs: LineDiff[] = [];
  for (const key of keys) {
    const aVal = valueOf(model, a, key, adjustments);
    const bVal = valueOf(model, b, key, adjustments);
    if (eq(aVal, bVal)) continue;

    // engine recompute component: engine base differs between the two base versions
    const engineDiffer = !eq(engineValue(model, baseA, key), engineValue(model, baseB, key));
    // adjustment component: a non-engine side's effective differs from its engine base
    const adjIds = new Set<string>();
    for (const side of [a, b]) {
      if (modeOf(model, side) === "engine") continue;
      const ev = effective(model, baseVersionOf(model, side), key, modeOf(model, side), adjustments);
      if (ev.source === "adjustment") ev.includes.forEach((id) => adjIds.add(id));
    }
    const adjDiffer = adjIds.size > 0;

    let cause: Cause = "unknown";
    if (engineDiffer && adjDiffer) cause = "both";
    else if (engineDiffer) cause = "engine";
    else if (adjDiffer) cause = "adjustment";

    // changelog verification for engine-vs-engine
    let changelogMatch: boolean | null = null;
    if (bothEngine) {
      const newer = Number(baseB.slice(1)) > Number(baseA.slice(1)) ? baseB : baseA;
      const v = model.versionById.get(newer);
      changelogMatch = (v?.changes_from_previous ?? []).some((c) => String((c as Record<string, unknown>).key) === key);
    }

    lineDiffs.push({
      key,
      label: model.lineByVersionKey.get(baseB)?.get(key)?.label ?? model.lineByVersionKey.get(baseA)?.get(key)?.label ?? null,
      aValue: aVal,
      bValue: bVal,
      cause,
      adjustmentIds: [...adjIds],
      trigger: cause !== "adjustment" && bothEngine ? triggerFor(model, Number(baseB.slice(1)) > Number(baseA.slice(1)) ? baseB : baseA) : null,
      changelogMatch,
    });
  }

  // changelog mismatches: engine diffs not listed in the newer changelog
  const changelogMismatches: string[] = [];
  if (bothEngine) {
    for (const d of lineDiffs) if (d.changelogMatch === false) changelogMismatches.push(d.key);
  }

  const totA = modeA === "engine"
    ? engineTotals(model, baseA)
    : returnTotals(model, baseA, modeA, adjustments);
  const totB = modeB === "engine"
    ? engineTotals(model, baseB)
    : returnTotals(model, baseB, modeB, adjustments);

  return {
    a, b, lineDiffs, changelogMismatches,
    summary: {
      taxFedA: totA.taxFed, taxFedB: totB.taxFed, taxCaA: totA.taxCa, taxCaB: totB.taxCa,
      payFedA: totA.payFed, payFedB: totB.payFed, payCaA: totA.payCa, payCaB: totB.payCa,
      balFedA: totA.balanceFed, balFedB: totB.balanceFed, balCaA: totA.balanceCa, balCaB: totB.balanceCa,
    },
  };
}

function engineTotals(model: PacketModel, versionId: string) {
  return returnTotals(model, versionId, "engine", []);
}
