"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { emitEvent } from "@/lib/event";
import { getSession } from "@/lib/session";
import { loadModel } from "@/lib/packet/load";
import type { ActorRef } from "@/lib/change/types";
import { isFrozen } from "@/lib/change/store";
import {
  authorizeDecision,
  computeDependencyHash,
  needsReopen,
  adjustmentsToStale,
  type DecisionAction,
} from "@/lib/judgment/decision";
import { decisionToDomain, optionsToJson } from "@/lib/judgment/store";
import { loadAdjustments } from "@/lib/change/store";
import { decisionTemplates } from "@/lib/judgment/templates";

class HttpError extends Error {
  constructor(public code: number, msg: string) {
    super(msg);
  }
}

async function actor(): Promise<ActorRef & { ws: string }> {
  const s = await getSession();
  return { id: s.staff.id, role: s.staff.role, ws: s.workspaceId };
}

/** Stable content hash of an evidence id from the packet (ev / doc / client item). */
function evidenceContentHash(model: ReturnType<typeof loadModel>, id: string): string {
  const ev = model.evById.get(id);
  if (ev) return createHash("sha256").update(JSON.stringify({ v: ev.value, t: ev.text_as_read })).digest("hex").slice(0, 12);
  const doc = model.docById.get(id);
  if (doc) return createHash("sha256").update(doc.pages.map((p) => p.printed_content).join("|")).digest("hex").slice(0, 12);
  const ci = model.clientItemById.get(id);
  if (ci) return createHash("sha256").update(JSON.stringify(ci)).digest("hex").slice(0, 12);
  return "unknown";
}

async function buildDependencyHash(evidenceIds: string[], watchedLineKeys: string[]): Promise<string> {
  const model = loadModel();
  const evidenceContentHashes: Record<string, string> = {};
  for (const id of evidenceIds) evidenceContentHashes[id] = evidenceContentHash(model, id);
  // Attachments added later (not in the packet) contribute their stored sha256.
  try {
    const atts = await prisma.attachment.findMany({ where: { id: { in: evidenceIds } } });
    for (const a of atts) evidenceContentHashes[a.id] = a.sha256 ?? a.id;
  } catch {
    /* ignore */
  }
  const watchedLineValues: Record<string, unknown> = {};
  for (const k of watchedLineKeys) watchedLineValues[k] = model.lineByVersionKey.get("v3")?.get(k)?.value ?? null;
  return computeDependencyHash({ evidenceIds, evidenceContentHashes, watchedLineValues });
}

const CreateSchema = z.object({
  templateKey: z.string().optional(),
  issueId: z.string().optional(),
  question: z.string().min(5),
  facts: z.string().optional(),
  type: z.enum(["judgment_call", "election", "due_diligence", "penalty", "scope", "variance_explanation", "completeness_attestation"]),
  authority: z.string().min(3),
  evidenceIds: z.string().min(1),
  selectedOptionId: z.string().optional(),
  positionStrength: z.enum(["substantial_authority", "reasonable_basis_disclosed_8275", "not_applicable"]).optional(),
  watchedLineKeys: z.string().optional(),
});

/** Create and propose a Decision. Validated (authority, evidence, options). */
export async function createDecision(formData: FormData): Promise<void> {
  if (await isFrozen()) throw new HttpError(409, "Frozen: the return is filed.");
  const p = CreateSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) throw new HttpError(422, p.error.issues.map((i) => i.message).join("; "));
  const d = p.data;
  const me = await actor();
  const model = loadModel();

  const evidenceIds = d.evidenceIds.split(/[,\s]+/).filter(Boolean);
  if (evidenceIds.length < 1) throw new HttpError(422, "At least one evidence id is required.");

  const tpl = d.templateKey ? decisionTemplates(model).find((t) => t.key === d.templateKey) : undefined;
  const options = tpl?.options ?? [];
  if (!["completeness_attestation", "variance_explanation"].includes(d.type) && options.length < 2)
    throw new HttpError(422, "A judgment needs at least two options.");

  const watchedLineKeys = (d.watchedLineKeys ?? tpl?.watchedLineKeys?.join(",") ?? "").split(/[,\s]+/).filter(Boolean);
  const dependencyHash = await buildDependencyHash(evidenceIds, watchedLineKeys);

  await prisma.$transaction(async (tx) => {
    const row = await tx.decision.create({
      data: {
        workspaceId: me.ws,
        issueId: d.issueId ?? tpl?.issueHint ?? null,
        question: d.question,
        facts: d.facts ?? tpl?.facts ?? null,
        evidenceIds,
        type: d.type,
        options: optionsToJson(options) as unknown as Prisma.InputJsonValue,
        selectedOptionId: d.selectedOptionId ?? null,
        authority: d.authority,
        positionStrength: d.positionStrength ?? "not_applicable",
        preparedBy: me.id,
        status: "proposed",
        dependencyHash,
        watchedLineKeys,
      },
    });
    await emitEvent(tx, {
      workspaceId: me.ws,
      actorId: me.id,
      type: "decision.proposed",
      entityKind: "decision",
      entityId: row.id,
      payload: { type: d.type, issueId: row.issueId },
    });
  });
  revalidatePath("/decisions");
  revalidatePath("/changes");
}

const TransitionSchema = z.object({
  id: z.string(),
  action: z.enum(["review", "approve", "reopen", "supersede"]),
  selectedOptionId: z.string().optional(),
});

/** Move a Decision. Reopen/supersede cascades its adjustments to stale. */
export async function transitionDecision(formData: FormData): Promise<void> {
  const p = TransitionSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) throw new HttpError(422, p.error.message);
  const me = await actor();
  const frozen = await isFrozen();

  await prisma.$transaction(async (tx) => {
    const row = await tx.decision.findUnique({ where: { id: p.data.id } });
    if (!row) throw new HttpError(404, "Decision not found.");
    if (p.data.selectedOptionId) row.selectedOptionId = p.data.selectedOptionId;
    const dec = decisionToDomain(row);

    // Missing-evidence gate: a template says a document is still outstanding.
    const model = loadModel();
    const tpl = decisionTemplates(model).find((t) => t.issueHint === dec.issueId);
    const missing = Boolean(tpl?.missingEvidence) && !dec.weakEvidenceAccepted && !dec.missingEvidenceResolved;

    const res = authorizeDecision(p.data.action as DecisionAction, dec, me, { frozen, missingEvidence: missing });
    if (!res.ok) throw new HttpError(res.code ?? 403, res.error ?? "Not allowed.");

    await tx.decision.update({
      where: { id: dec.id },
      data: {
        status: res.patch?.status ?? row.status,
        reviewedBy: res.patch?.reviewedBy ?? row.reviewedBy,
        selectedOptionId: p.data.selectedOptionId ?? row.selectedOptionId,
        revision: res.patch?.revision ?? row.revision,
      },
    });
    await emitEvent(tx, {
      workspaceId: me.ws,
      actorId: me.id,
      type: `decision.${res.patch?.status ?? p.data.action}`,
      entityKind: "decision",
      entityId: dec.id,
      payload: { action: p.data.action },
    });

    if (p.data.action === "reopen" || p.data.action === "supersede") {
      const adjs = await loadAdjustments(me.ws);
      for (const a of adjustmentsToStale(dec.issueId, adjs)) {
        await tx.adjustment.update({ where: { id: a.id }, data: { status: "stale", version: { increment: 1 } } });
        await emitEvent(tx, {
          workspaceId: me.ws,
          actorId: me.id,
          type: "adjustment.stale",
          entityKind: "adjustment",
          entityId: a.id,
          payload: { cause: `decision ${dec.id} ${p.data.action}` },
        });
      }
    }
  });
  revalidatePath("/decisions");
  revalidatePath("/changes");
}

/** Attach evidence to a Decision. If approved and the dependency changes, reopen. */
export async function attachDecisionEvidence(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const evidenceId = String(formData.get("evidenceId") ?? "").trim();
  if (!evidenceId) throw new HttpError(422, "evidenceId required.");
  const me = await actor();

  await prisma.$transaction(async (tx) => {
    const row = await tx.decision.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, "Decision not found.");
    const evidenceIds = [...new Set([...row.evidenceIds, evidenceId])];
    const newHash = await buildDependencyHash(evidenceIds, row.watchedLineKeys);
    const dec = decisionToDomain(row);
    const reopen = needsReopen(dec, newHash);

    await tx.decision.update({
      where: { id },
      data: {
        evidenceIds,
        dependencyHash: newHash,
        missingEvidenceResolved: true,
        status: reopen ? "reopened" : row.status,
        revision: reopen ? row.revision + 1 : row.revision,
      },
    });
    await emitEvent(tx, {
      workspaceId: me.ws,
      actorId: me.id,
      type: reopen ? "decision.reopened" : "decision.evidence_added",
      entityKind: "decision",
      entityId: id,
      payload: { evidenceId, reopened: reopen },
    });

    if (reopen) {
      const adjs = await loadAdjustments(me.ws);
      for (const a of adjustmentsToStale(dec.issueId, adjs)) {
        await tx.adjustment.update({ where: { id: a.id }, data: { status: "stale", version: { increment: 1 } } });
        await emitEvent(tx, { workspaceId: me.ws, actorId: me.id, type: "adjustment.stale", entityKind: "adjustment", entityId: a.id, payload: { cause: `decision ${id} reopened` } });
      }
    }
  });
  revalidatePath("/decisions");
  revalidatePath("/changes");
}

export async function acceptWeakEvidence(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const me = await actor();
  await prisma.decision.update({ where: { id }, data: { weakEvidenceAccepted: true } });
  await prisma.$transaction((tx) =>
    emitEvent(tx, { workspaceId: me.ws, actorId: me.id, type: "decision.weak_evidence_accepted", entityKind: "decision", entityId: id, payload: {} }),
  );
  revalidatePath("/decisions");
}

const ExplainSchema = z.object({
  key2025: z.string().min(1),
  explanationType: z.enum(["explained_by_event", "caused_by_issue", "unexplained"]),
  refs: z.string().optional(),
  reason: z.string().min(10),
});

/** Record a prior-year variance explanation as a Decision (feeds the required step). */
export async function explainVariance(formData: FormData): Promise<void> {
  const p = ExplainSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) throw new HttpError(422, p.error.issues.map((i) => i.message).join("; "));
  const d = p.data;
  const me = await actor();
  const refs = (d.refs ?? "").split(/[,\s]+/).filter(Boolean);
  if (d.explanationType !== "unexplained" && refs.length < 1)
    throw new HttpError(422, "An explanation other than 'unexplained' needs a reference.");

  await prisma.$transaction(async (tx) => {
    const row = await tx.decision.create({
      data: {
        workspaceId: me.ws,
        issueId: `variance:${d.key2025}`,
        question: `Explain the year-over-year change in ${d.key2025}`,
        facts: d.reason,
        evidenceIds: refs.length ? refs : ["(none)"],
        type: "variance_explanation",
        options: [] as unknown as Prisma.InputJsonValue,
        authority: "Firm standard: prior-year variances explained.",
        positionStrength: "not_applicable",
        preparedBy: me.id,
        status: d.explanationType === "unexplained" ? "draft" : "proposed",
        watchedLineKeys: [d.key2025],
      },
    });
    await emitEvent(tx, {
      workspaceId: me.ws,
      actorId: me.id,
      type: "decision.proposed",
      entityKind: "decision",
      entityId: row.id,
      payload: { kind: "variance_explanation", key: d.key2025, explanationType: d.explanationType },
    });
  });
  revalidatePath("/variance");
}

/** Attest an area as considered. Server recomputes readiness; override needs a reason. */
export async function attestArea(formData: FormData): Promise<void> {
  const area = String(formData.get("area") ?? "");
  const readiness = String(formData.get("readiness") ?? "red");
  const reason = String(formData.get("reason") ?? "").trim();
  const me = await actor();
  if (readiness !== "green" && reason.length < 10)
    throw new HttpError(422, "Attesting a non-green area requires an override reason (a reviewer signs it).");
  await prisma.areaReview.upsert({
    where: { workspaceId_area: { workspaceId: me.ws, area } },
    create: { workspaceId: me.ws, area, computedReadiness: readiness, attestedBy: me.id, attestedAt: new Date(), reason: reason || null },
    update: { computedReadiness: readiness, attestedBy: me.id, attestedAt: new Date(), reason: reason || null },
  });
  revalidatePath("/completeness");
}
