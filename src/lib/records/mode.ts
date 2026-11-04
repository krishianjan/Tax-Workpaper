import { createHash } from "node:crypto";
import type { PacketModel } from "../packet/model";
import type { Adjustment, Mode } from "../change/types";
import { returnTotals } from "../change/effective";

// Feature 8 records are generated VIEWS over the effective data. Every record
// carries a mode switch: engine v3 · final (approved) · filed snapshot ·
// amendment. The record builders read effective values through change/effective
// using the change-engine Mode that a record mode maps to; the page overlays a
// filed Snapshot or amendment layer when one exists in the DB.

export type RecordMode = "engine" | "final" | "filed" | "amendment";

export const RECORD_MODES: RecordMode[] = ["engine", "final", "filed", "amendment"];

export const RECORD_MODE_LABEL: Record<RecordMode, string> = {
  engine: "Engine (v3)",
  final: "Final (approved)",
  filed: "Filed snapshot",
  amendment: "Amendment",
};

/** The change-engine Mode a record mode reads through. filed/amendment resolve
 *  to the approved set (the page swaps in snapshot/amendment lines when present). */
export function toChangeMode(mode: RecordMode): Mode {
  return mode === "engine" ? "engine" : "final";
}

export function isRecordMode(x: string | null | undefined): x is RecordMode {
  return x === "engine" || x === "final" || x === "filed" || x === "amendment";
}

export interface RecordMeta {
  client: string;
  taxYear: number;
  mode: RecordMode;
  modeLabel: string;
  packetSha: string;
  snapshotHash: string; // content hash of the effective totals under this mode
  generatedAt: string; // ISO
}

/** A stable content hash of the totals a record is generated against, so a
 *  printed record carries a verifiable snapshot hash. */
export function snapshotHash(model: PacketModel, versionId: string, mode: RecordMode, adjustments: Adjustment[]): string {
  const t = returnTotals(model, versionId, toChangeMode(mode), adjustments);
  const material = `${mode}|${t.taxFed}|${t.taxCa}|${t.payFed}|${t.payCa}|${t.balanceFed}|${t.balanceCa}`;
  return createHash("sha256").update(material).digest("hex").slice(0, 16);
}

export function buildRecordMeta(
  model: PacketModel,
  versionId: string,
  mode: RecordMode,
  adjustments: Adjustment[],
  generatedAt: string,
): RecordMeta {
  const household = model.raw.household as Record<string, unknown>;
  const people = (household.people ?? []) as Array<Record<string, unknown>>;
  const names = people.filter((p) => p.role === "taxpayer" || p.role === "spouse").map((p) => String(p.name));
  const client = names.join(" & ") || "Client";
  const taxYear = Number(household.tax_year ?? 2025);
  return {
    client,
    taxYear,
    mode,
    modeLabel: RECORD_MODE_LABEL[mode],
    packetSha: model.sha256.slice(0, 12),
    snapshotHash: snapshotHash(model, versionId, mode, adjustments),
    generatedAt,
  };
}
