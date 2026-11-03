import type { PacketModel } from "../packet/model";
import type { RateCategory } from "../taxEffect";
import { taxEffects } from "../effects";

// What-if sandbox. A Scenario NEVER writes to adjustments. The 5 packet
// alternatives give EXACT results with changed_lines; custom what-ifs use the
// rate estimate, labelled. Combining two scenarios sums the exacts as an
// estimate and says so.

export interface ScenarioResult {
  id: string;
  exact: boolean;
  label: string;
  fedTaxChange: bigint; // cents
  caTaxChange: bigint; // cents
  changedLines: Array<{ key: string; old: unknown; new: unknown }>;
  note?: string;
}

function alternatives(model: PacketModel): Array<Record<string, unknown>> {
  const alts = (model.raw as Record<string, unknown>).what_if as Record<string, unknown> | undefined;
  const list = alts?.alternatives;
  return Array.isArray(list) ? (list as Array<Record<string, unknown>>) : [];
}

function cents(n: unknown): bigint {
  return typeof n === "number" ? BigInt(Math.round(n * 100)) : 0n;
}

export function evaluateAlternative(model: PacketModel, id: string): ScenarioResult | null {
  const alt = alternatives(model).find((a) => a.id === id);
  if (!alt) return null;
  const fed = (alt.federal as Record<string, unknown>)?.total_tax_change;
  const ca = (alt.california as Record<string, unknown>)?.total_tax_change;
  const changed = Array.isArray(alt.changed_lines)
    ? (alt.changed_lines as Array<Record<string, unknown>>).map((c) => ({ key: String(c.key), old: c.old, new: c.new }))
    : [];
  return {
    id,
    exact: true,
    label: String(alt.description ?? id),
    fedTaxChange: cents(fed),
    caTaxChange: cents(ca),
    changedLines: changed,
  };
}

/** Combine scenarios. One exact alt passes through; two or more sum as an estimate. */
export function combineScenarios(model: PacketModel, ids: string[]): ScenarioResult {
  const results = ids.map((id) => evaluateAlternative(model, id)).filter((r): r is ScenarioResult => r !== null);
  if (results.length === 1) return results[0];
  const fed = results.reduce((s, r) => s + r.fedTaxChange, 0n);
  const ca = results.reduce((s, r) => s + r.caTaxChange, 0n);
  return {
    id: ids.join("+"),
    exact: false,
    label: results.map((r) => r.id).join(" + "),
    fedTaxChange: fed,
    caTaxChange: ca,
    changedLines: results.flatMap((r) => r.changedLines),
    note: "Interaction not modelled; effects summed as an estimate.",
  };
}

/** A custom what-if with no packet alternative: rate estimate, labelled. */
export function customScenario(
  model: PacketModel,
  versionId: string,
  opts: { label: string; baseDeltaCents: bigint; category: RateCategory; caSource?: boolean },
): ScenarioResult {
  const e = taxEffects(opts.baseDeltaCents, opts.category, { model, versionId, caSource: opts.caSource });
  return {
    id: "custom:" + opts.label,
    exact: false,
    label: opts.label,
    fedTaxChange: e.taxFed,
    caTaxChange: e.taxCa,
    changedLines: [],
    note: "Estimate (rate-based); the engine recomputes exact numbers on filing.",
  };
}
