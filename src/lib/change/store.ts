import "server-only";
import { prisma } from "../db";
import { DEFAULT_WORKSPACE } from "../session";
import type { Adjustment, AdjTarget, AdjStatus, AdjMethod } from "./types";

// Maps Prisma Adjustment rows to the pure-engine domain objects and back.
// The engine never sees Prisma; the DB never drives rules.

type Row = Awaited<ReturnType<typeof prisma.adjustment.findMany>>[number];

export function toDomain(row: Row): Adjustment {
  return {
    id: row.id,
    issueId: row.issueId,
    baseVersionId: row.baseVersionId,
    targets: (row.targets as unknown as AdjTarget[]) ?? [],
    primaryLineKey: row.primaryLineKey,
    rateCategory: row.rateCategory,
    caSourceFlag: row.caSourceFlag,
    baseDeltaCents: row.baseDeltaCents,
    effects: {
      taxFed: row.taxEffectFed,
      taxCa: row.taxEffectCa,
      payFed: row.paymentEffectFed,
      payCa: row.paymentEffectCa,
    },
    method: row.method as AdjMethod,
    reason: row.reason,
    evidenceIds: row.evidenceIds,
    preparedBy: row.preparedBy,
    reviewedBy: row.reviewedBy,
    approvedBy: row.approvedBy,
    batchId: row.batchId,
    supersedesId: row.supersedesId,
    version: row.version,
    status: row.status as AdjStatus,
    createdAt: row.createdAt.toISOString(),
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
  };
}

export async function loadAdjustments(workspaceId: string = DEFAULT_WORKSPACE): Promise<Adjustment[]> {
  try {
    const rows = await prisma.adjustment.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
    return rows.map(toDomain);
  } catch {
    return [];
  }
}

export async function loadAdjustmentsByIssue(issueId: string, workspaceId: string = DEFAULT_WORKSPACE): Promise<Adjustment[]> {
  try {
    const rows = await prisma.adjustment.findMany({ where: { issueId, workspaceId }, orderBy: { createdAt: "asc" } });
    return rows.map(toDomain);
  } catch {
    return [];
  }
}

/** Is the return frozen (filed) in this workspace? */
export async function isFrozen(workspaceId: string = DEFAULT_WORKSPACE): Promise<boolean> {
  try {
    const filed = await prisma.snapshot.findFirst({ where: { kind: "filed", workspaceId } });
    return Boolean(filed);
  } catch {
    return false;
  }
}
