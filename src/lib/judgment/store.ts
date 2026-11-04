import "server-only";
import { prisma } from "../db";
import type { Decision, DecisionOption, DecisionType, DecisionStatus } from "./decision";

// Decision option effects are bigint cents; Prisma Json can't hold bigint, so we
// store them as strings in the options jsonb and convert on the way in/out.

interface StoredOption extends Omit<DecisionOption, "taxEffectFed" | "taxEffectCa"> {
  taxEffectFed: string;
  taxEffectCa: string;
}

export function optionsToJson(options: DecisionOption[]): StoredOption[] {
  return options.map((o) => ({ ...o, taxEffectFed: o.taxEffectFed.toString(), taxEffectCa: o.taxEffectCa.toString() }));
}

function optionsFromJson(raw: unknown): DecisionOption[] {
  if (!Array.isArray(raw)) return [];
  return (raw as StoredOption[]).map((o) => ({
    ...o,
    taxEffectFed: BigInt(o.taxEffectFed ?? "0"),
    taxEffectCa: BigInt(o.taxEffectCa ?? "0"),
  }));
}

type Row = Awaited<ReturnType<typeof prisma.decision.findMany>>[number];

export function decisionToDomain(row: Row): Decision {
  return {
    id: row.id,
    issueId: row.issueId,
    question: row.question,
    facts: row.facts,
    evidenceIds: row.evidenceIds,
    type: row.type as DecisionType,
    options: optionsFromJson(row.options),
    selectedOptionId: row.selectedOptionId,
    authority: row.authority,
    positionStrength: (row.positionStrength as Decision["positionStrength"]) ?? null,
    preparedBy: row.preparedBy,
    reviewedBy: row.reviewedBy,
    approvedBy: row.approvedBy,
    status: row.status as DecisionStatus,
    revision: row.revision,
    supersedesId: row.supersedesId,
    dependencyHash: row.dependencyHash,
    watchedLineKeys: row.watchedLineKeys,
    weakEvidenceAccepted: row.weakEvidenceAccepted,
    missingEvidenceResolved: row.missingEvidenceResolved,
  };
}

const DEFAULT_WS = "ws-main";

export async function loadDecisions(workspaceId: string = DEFAULT_WS): Promise<Decision[]> {
  try {
    const rows = await prisma.decision.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
    return rows.map(decisionToDomain);
  } catch {
    return [];
  }
}

export async function loadDecision(id: string): Promise<Decision | null> {
  try {
    const row = await prisma.decision.findUnique({ where: { id } });
    return row ? decisionToDomain(row) : null;
  } catch {
    return null;
  }
}

export async function loadDueDiligence(workspaceId: string = DEFAULT_WS) {
  try {
    return await prisma.dueDiligence.findMany({ where: { workspaceId } });
  } catch {
    return [];
  }
}

export async function loadAreaReviews(workspaceId: string = DEFAULT_WS) {
  try {
    return await prisma.areaReview.findMany({ where: { workspaceId } });
  } catch {
    return [];
  }
}
