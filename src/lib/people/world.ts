import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "../db";
import { loadModel } from "../packet/load";
import { loadAdjustments } from "../change/store";
import { loadDecisions } from "../judgment/store";
import { returnTotals } from "../change/effective";
import { toCents } from "../money";
import type { World } from "./signoff";

// Builds the World snapshot that sign-off hashes are computed against. AGI is
// engine-level (our rate adjustments change tax, not AGI); tax/payments/balance
// come from the FINAL effective totals. The identity hash folds in any
// FactCorrection, so correcting Theo's SSN changes it.

export async function buildWorld(versionId = "v3"): Promise<World> {
  const model = loadModel();
  const adjustments = await loadAdjustments();
  const decisions = await loadDecisions();

  const totals = returnTotals(model, versionId, "final", adjustments);
  const agi = toCents(model.versionById.get(versionId)?.summary && (model.versionById.get(versionId)!.summary as Record<string, Record<string, unknown>>).federal?.agi) ?? 0n;

  // Identity: household SSNs + any FactCorrection applied.
  const people = ((model.raw.household as Record<string, unknown>).people ?? []) as Array<Record<string, unknown>>;
  const ssnParts = people.map((p) => `${p.id}:${String(p.ssn ?? "")}`).sort();
  let corrections: string[] = [];
  try {
    const fcs = await prisma.factCorrection.findMany({ orderBy: { at: "asc" } });
    corrections = fcs.map((f) => `${f.extractedValueId}=${JSON.stringify(f.corrected)}`);
  } catch {
    /* ignore */
  }
  const identityHash = createHash("sha256").update(JSON.stringify({ ssnParts, corrections })).digest("hex").slice(0, 16);

  const decisionHashes: Record<string, string> = {};
  for (const d of decisions)
    decisionHashes[d.id] = createHash("sha256").update(`${d.status}|${d.selectedOptionId}|${d.dependencyHash}`).digest("hex").slice(0, 12);

  return {
    amounts: { agi, totalTax: totals.taxFed, payments: totals.payFed, balance: totals.balanceFed },
    identityHash,
    decisionHashes,
    lineValues: {},
  };
}

/** Firm re-sign policy: amounts (default) or amounts_and_identity. */
export function resignPolicy(): "amounts" | "amounts_and_identity" {
  const std = (loadModel().raw.firm as Record<string, unknown>).starter_standards as Record<string, unknown> | undefined;
  const v = std?.resign_on;
  return v === "amounts_and_identity" ? "amounts_and_identity" : "amounts";
}
