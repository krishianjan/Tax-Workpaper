import "server-only";
import { prisma } from "../db";
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

export async function loadAdjustments(): Promise<Adjustment[]> {
  try {
    const rows = await prisma.adjustment.findMany({ orderBy: { createdAt: "asc" } });
    return rows.map(toDomain);
  } catch {
    return [];
  }
}

export async function loadAdjustmentsByIssue(issueId: string): Promise<Adjustment[]> {
  try {
    const rows = await prisma.adjustment.findMany({ where: { issueId }, orderBy: { createdAt: "asc" } });
    return rows.map(toDomain);
  } catch {
    return [];
  }
}

/** Is the return frozen (filed)? Block 4 writes a 'filed' Snapshot. */
export async function isFrozen(): Promise<boolean> {
  try {
    const filed = await prisma.snapshot.findFirst({ where: { kind: "filed" } });
    return Boolean(filed);
  } catch {
    return false;
  }
}
