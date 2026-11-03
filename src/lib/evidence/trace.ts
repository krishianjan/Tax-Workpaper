import type { PacketModel } from "../packet/model";
import type { PacketReturnLine } from "../packet/schema";
import { resolveRef, type ResolvedRef } from "../refs/resolve";

// Forward trace (5.2): a line's recipe tree — inputs (other lines, same
// version) recursed, plus resolved sources. Backward trace (5.3): everywhere a
// document landed across all versions.

const MAX_DEPTH = 25;

export interface RecipeNode {
  versionId: string;
  key: string;
  label: string;
  value: unknown;
  rule: string | null;
  ruleText: string | null;
  note: string | null;
  sources: ResolvedRef[];
  inputs: RecipeNode[];
  truncated?: "cycle" | "depth";
}

function ruleText(model: PacketModel, rule: string | null | undefined): string | null {
  if (!rule) return null;
  const rules = (model.raw.engine_reference as Record<string, unknown>).rules;
  if (rules && typeof rules === "object" && rule in (rules as Record<string, unknown>)) {
    return String((rules as Record<string, unknown>)[rule]);
  }
  return null;
}

export function buildRecipe(
  model: PacketModel,
  versionId: string,
  key: string,
  visited: Set<string> = new Set(),
  depth = 0,
): RecipeNode | null {
  const lines = model.lineByVersionKey.get(versionId);
  const line = lines?.get(key);
  if (!line) return null;

  const node: RecipeNode = {
    versionId,
    key,
    label: line.label ?? key,
    value: line.value,
    rule: line.rule ?? null,
    ruleText: ruleText(model, line.rule),
    note: line.note ?? null,
    sources: line.sources.map((s) => resolveRef(model, s, versionId)),
    inputs: [],
  };

  if (depth >= MAX_DEPTH) {
    node.truncated = "depth";
    return node;
  }
  if (visited.has(key)) {
    node.truncated = "cycle";
    return node;
  }
  visited.add(key);

  for (const inputKey of line.inputs) {
    const child = buildRecipe(model, versionId, inputKey, new Set(visited), depth + 1);
    if (child) node.inputs.push(child);
    else {
      // input references a key not present as a line — resolve generically
      const r = resolveRef(model, inputKey, versionId);
      node.inputs.push({
        versionId,
        key: inputKey,
        label: r.label,
        value: r.resolved ? "(see reference)" : "(unresolved)",
        rule: null,
        ruleText: null,
        note: r.error ?? null,
        sources: [r],
        inputs: [],
      });
    }
  }

  return node;
}

export interface WhereUsedLine {
  versionId: string;
  key: string;
  label: string;
  value: unknown;
  via: string[]; // which refs matched (ev ids or the doc id)
}

/** Backward trace: every line in every version that cites this doc or its values. */
export function whereDocLanded(model: PacketModel, docId: string): WhereUsedLine[] {
  const evIds = new Set((model.evsByDoc.get(docId) ?? []).map((e) => e.id));
  const out: WhereUsedLine[] = [];
  for (const v of model.versions) {
    for (const ln of v.lines) {
      const via: string[] = [];
      for (const s of ln.sources) {
        if (s === docId || evIds.has(s) || s.startsWith(`doc:${docId}#`)) via.push(s);
      }
      if (via.length) {
        out.push({ versionId: v.version, key: ln.key, label: ln.label ?? ln.key, value: ln.value, via });
      }
    }
  }
  return out;
}

/** Backward trace for a single extracted value. */
export function whereValueLanded(model: PacketModel, evId: string): WhereUsedLine[] {
  const out: WhereUsedLine[] = [];
  for (const v of model.versions) {
    for (const ln of v.lines) {
      if (ln.sources.includes(evId)) {
        out.push({ versionId: v.version, key: ln.key, label: ln.label ?? ln.key, value: ln.value, via: [evId] });
      }
    }
  }
  return out;
}

export function findLine(model: PacketModel, versionId: string, key: string): PacketReturnLine | undefined {
  return model.lineByVersionKey.get(versionId)?.get(key);
}
