"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { emitEvent } from "@/lib/event";
import { getSession } from "@/lib/session";
import { loadModel } from "@/lib/packet/load";
import { taxEffects, paymentEffects } from "@/lib/effects";
import type { RateCategory } from "@/lib/taxEffect";
import { authorize, type Action } from "@/lib/change/approval";
import { toDomain, isFrozen } from "@/lib/change/store";
import { planBatch, canUndoBatch, BATCH_CAP } from "@/lib/change/batch";
import type { ActorRef } from "@/lib/change/types";

async function actorAndWs(): Promise<ActorRef & { ws: string }> {
  const s = await getSession();
  return { id: s.staff.id, role: s.staff.role, ws: s.workspaceId };
}

class HttpError extends Error {
  constructor(public code: number, msg: string) { super(msg); }
}

const ProposeSchema = z.object({
  issueId: z.string().optional(),
  baseVersionId: z.string().default("v3"),
  primaryLineKey: z.string().min(1),
  targets: z.string(),
  kind: z.enum(["tax", "payment"]),
  rateCategory: z.string().optional(),
  caSourceFlag: z.coerce.boolean().default(false),
  baseDeltaCents: z.coerce.number().int().default(0),
  payFedCents: z.coerce.number().int().default(0),
  payCaCents: z.coerce.number().int().default(0),
  method: z.enum(["rate_estimate", "what_if_exact"]).default("rate_estimate"),
  reason: z.string().min(15, "Reason must be at least 15 characters."),
  evidenceIds: z.string().min(1, "At least one evidence id is required."),
});

export async function proposeAdjustment(formData: FormData): Promise<void> {
  const me = await actorAndWs();
  if (await isFrozen(me.ws)) throw new HttpError(409, "Frozen: the return is filed. Amend on top.");
  const p = ProposeSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) throw new HttpError(422, p.error.issues.map((i) => i.message).join("; "));
  const d = p.data;
  const model = loadModel();

  const evidenceIds = d.evidenceIds.split(/[,\s]+/).filter(Boolean);
  if (evidenceIds.length === 0) throw new HttpError(422, "At least one evidence id is required.");

  let targets: unknown;
  try { targets = JSON.parse(d.targets); } catch { throw new HttpError(422, "targets must be valid JSON."); }

  const eff =
    d.kind === "payment"
      ? paymentEffects({ fedDeltaCents: BigInt(d.payFedCents), caDeltaCents: BigInt(d.payCaCents) })
      : taxEffects(BigInt(d.baseDeltaCents), (d.rateCategory ?? "ordinary_income") as RateCategory, {
          model, versionId: d.baseVersionId, caSource: d.caSourceFlag,
        });

  await prisma.$transaction(async (tx) => {
    const row = await tx.adjustment.create({
      data: {
        workspaceId: me.ws,
        issueId: d.issueId ?? null,
        baseVersionId: d.baseVersionId,
        targets: targets as Prisma.InputJsonValue,
        primaryLineKey: d.primaryLineKey,
        rateCategory: d.rateCategory ?? null,
        caSourceFlag: d.caSourceFlag,
        baseDeltaCents: BigInt(d.baseDeltaCents),
        taxEffectFed: eff.taxFed,
        taxEffectCa: eff.taxCa,
        paymentEffectFed: eff.payFed,
        paymentEffectCa: eff.payCa,
        method: d.method,
        reason: d.reason,
        evidenceIds,
        preparedBy: me.id,
        status: "proposed",
      },
    });
    await emitEvent(tx, {
      workspaceId: me.ws,
      actorId: me.id,
      type: "adjustment.proposed",
      entityKind: "adjustment",
      entityId: row.id,
      payload: { issueId: d.issueId ?? null, primaryLineKey: d.primaryLineKey },
    });
  });
  revalidatePath("/issues");
  revalidatePath("/changes");
}

const TransitionSchema = z.object({
  id: z.string(),
  action: z.enum(["propose", "review", "approve", "reject", "revert"]),
  expectedVersion: z.coerce.number().int(),
});

export async function transitionAdjustment(formData: FormData): Promise<void> {
  const p = TransitionSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) throw new HttpError(422, p.error.message);
  const { id, action, expectedVersion } = p.data;
  const me = await actorAndWs();
  const model = loadModel();
  const frozen = await isFrozen(me.ws);

  await prisma.$transaction(async (tx) => {
    const row = await tx.adjustment.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, "Adjustment not found.");
    if (row.version !== expectedVersion)
      throw new HttpError(409, `Stale write: this item changed (version ${row.version} != ${expectedVersion}). Reload.`);

    const adj = toDomain(row);
    const res = authorize(action as Action, adj, me, model, { frozen });
    if (!res.ok) throw new HttpError(res.code ?? 403, res.error ?? "Not allowed.");

    const patch = res.patch ?? {};
    await tx.adjustment.update({
      where: { id },
      data: {
        status: patch.status ?? row.status,
        reviewedBy: patch.reviewedBy ?? row.reviewedBy,
        approvedBy: patch.approvedBy ?? row.approvedBy,
        preparedBy: patch.preparedBy ?? row.preparedBy,
        approvedAt: patch.approvedAt ? new Date(patch.approvedAt) : row.approvedAt,
        version: { increment: 1 },
      },
    });
    await emitEvent(tx, {
      workspaceId: me.ws,
      actorId: me.id,
      type: "adjustment." + (patch.status ?? action),
      entityKind: "adjustment",
      entityId: id,
      payload: { action, from: row.status, to: patch.status },
    });
  });
  revalidatePath("/issues");
  revalidatePath("/changes");
}

export async function markSeen(formData: FormData): Promise<void> {
  const seq = Number(formData.get("seq") ?? 0);
  const me = await actorAndWs();
  await prisma.userCursor.upsert({
    where: { userId: me.id },
    create: { userId: me.id, workspaceId: me.ws, lastSeenSeq: seq },
    update: { lastSeenSeq: seq },
  });
  revalidatePath("/changes");
}

const BulkVerifySchema = z.object({ evIds: z.string().min(1), verificationType: z.string().min(1) });

export async function bulkVerify(formData: FormData): Promise<void> {
  const me = await actorAndWs();
  if (await isFrozen(me.ws)) throw new HttpError(409, "Frozen: the return is filed.");
  const p = BulkVerifySchema.safeParse(Object.fromEntries(formData));
  if (!p.success) throw new HttpError(422, p.error.message);
  const evIds = p.data.evIds.split(/[,\s]+/).filter(Boolean);
  const plan = planBatch(evIds.map((ref) => ({ ref, ok: true })));
  if (plan.overCap) throw new HttpError(422, "Batch exceeds the " + BATCH_CAP + "-item cap.");

  await prisma.$transaction(async (tx) => {
    const batch = await tx.batch.create({
      data: { workspaceId: me.ws, actorId: me.id, action: "bulk_verify", itemRefs: plan.applicable },
    });
    for (const evId of plan.applicable) {
      await tx.verification.create({
        data: { workspaceId: me.ws, extractedValueId: evId, status: "human_verified", method: "human", verificationType: p.data.verificationType, actorId: me.id },
      });
    }
    await emitEvent(tx, {
      workspaceId: me.ws,
      actorId: me.id,
      type: "batch.applied",
      entityKind: "batch",
      entityId: batch.id,
      payload: { action: "bulk_verify", count: plan.applicable.length },
    });
  });
  revalidatePath("/changes");
}

export async function undoBatch(formData: FormData): Promise<void> {
  const me = await actorAndWs();
  if (await isFrozen(me.ws)) throw new HttpError(409, "Frozen: the return is filed.");
  const batchId = String(formData.get("batchId") ?? "");
  await prisma.$transaction(async (tx) => {
    const batch = await tx.batch.findUnique({ where: { id: batchId } });
    if (!batch) throw new HttpError(404, "Batch not found.");
    if (batch.undoneByBatchId) throw new HttpError(422, "Batch already undone.");
    const undo = canUndoBatch(batch.itemRefs.map((ref) => ({ ref })));
    if (!undo.ok) throw new HttpError(422, "Undo blocked: " + undo.blockers.map((b) => b.ref + " (" + b.reason + ")").join(", "));

    const comp = await tx.batch.create({
      data: { workspaceId: me.ws, actorId: me.id, action: "undo", itemRefs: batch.itemRefs },
    });
    for (const evId of batch.itemRefs) {
      await tx.verification.create({
        data: { workspaceId: me.ws, extractedValueId: evId, status: "needs_human", method: "human", note: "reverted by batch " + comp.id, actorId: me.id },
      });
    }
    await tx.batch.update({ where: { id: batchId }, data: { undoneByBatchId: comp.id } });
    await emitEvent(tx, {
      workspaceId: me.ws,
      actorId: me.id,
      type: "batch.undone",
      entityKind: "batch",
      entityId: batchId,
      payload: { compensatingBatch: comp.id, count: batch.itemRefs.length },
    });
  });
  revalidatePath("/changes");
}
