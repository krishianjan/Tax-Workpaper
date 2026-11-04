"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { emitEvent } from "@/lib/event";
import { getSession } from "@/lib/session";
import { loadModel } from "@/lib/packet/load";
import { can, type Actor, type Action, type Resource } from "@/lib/people/permissions";
import { noteTransition, type ReviewNoteT } from "@/lib/people/reviewNotes";
import { questionTransition, type QuestionT } from "@/lib/people/questions";
import { coveredHashFor, recomputeSignOffs, type SignOff as SignOffT, type SignLevel, type SignScope } from "@/lib/people/signoff";
import { shouldEmit, type NotificationT } from "@/lib/people/notifications";
import { buildWorld, resignPolicy } from "@/lib/people/world";
import { isFrozen } from "@/lib/change/store";

class HttpError extends Error {
  constructor(public code: number, msg: string) { super(msg); }
}

async function staffActorAndWs(): Promise<{ actor: Actor; ws: string }> {
  const s = await getSession();
  const st = loadModel().staffById.get(s.staff.id);
  return {
    actor: {
      id: s.staff.id,
      role: s.staff.role as Actor["role"],
      clearance: s.staff.sensitive_data_clearance === true,
      activeFrom: (st as unknown as { active_from?: string })?.active_from ?? "2000-01-01",
    },
    ws: s.workspaceId,
  };
}

function clientActor(id: string): Actor {
  return { id, role: "client", clearance: false, activeFrom: "2000-01-01" };
}

async function guard(actor: Actor, action: Action, resource: Resource): Promise<void> {
  const frozen = await isFrozen();
  const d = can(actor, action, resource, { now: new Date().toISOString(), frozen, ownEngagementClientIds: ["cu-01", "cu-02"] });
  if (!d.allow) throw new HttpError(403, d.reason);
}

type Tx = PrismaClient | Prisma.TransactionClient;

async function notify(tx: Tx, n: NotificationT & { ws: string }, message: string): Promise<void> {
  const { ws, ...nData } = n;
  const recent = await tx.notification.findMany({
    where: { workspaceId: ws, userId: nData.userId, type: nData.type, entityId: nData.entityId },
    orderBy: { at: "desc" },
    take: 5,
  });
  const recentT: NotificationT[] = recent.map((r) => ({ userId: r.userId, type: r.type, entityId: r.entityId, at: r.at.toISOString() }));
  if (!shouldEmit(nData, recentT)) return;
  await tx.notification.create({ data: { workspaceId: ws, userId: nData.userId, type: nData.type, entityId: nData.entityId, message } });
}

// ---- Questions (5.2) --------------------------------------------------------
const AskSchema = z.object({
  toId: z.string().min(1),
  targetKind: z.enum(["issue", "decision", "line", "document"]),
  targetId: z.string().min(1),
  text: z.string().min(3),
  blocksFiling: z.coerce.boolean().default(false),
});

export async function askQuestion(formData: FormData): Promise<void> {
  const { actor, ws } = await staffActorAndWs();
  await guard(actor, "question.ask", { kind: "question" });
  const p = AskSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) throw new HttpError(422, p.error.message);
  const d = p.data;
  await prisma.$transaction(async (tx) => {
    const q = await tx.question.create({
      data: { workspaceId: ws, fromId: actor.id, toId: d.toId, targetKind: d.targetKind, targetId: d.targetId, text: d.text, blocksFiling: d.blocksFiling, status: "open" },
    });
    await emitEvent(tx, { workspaceId: ws, actorId: actor.id, type: "question.asked", entityKind: "question", entityId: q.id, payload: { toId: d.toId, target: `${d.targetKind}:${d.targetId}` } });
    await notify(tx, { ws, userId: d.toId, type: "question.asked", entityId: q.id, at: new Date().toISOString() }, `New question: ${d.text.slice(0, 60)}`);
  });
  revalidatePath("/questions");
}

const AnswerSchema = z.object({ id: z.string(), text: z.string().min(1), asClient: z.string().optional() });

export async function answerQuestion(formData: FormData): Promise<void> {
  const p = AnswerSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) throw new HttpError(422, p.error.message);
  const session = await getSession();
  const ws = session.workspaceId;
  await prisma.$transaction(async (tx) => {
    const q = await tx.question.findUnique({ where: { id: p.data.id } });
    if (!q) throw new HttpError(404, "Question not found.");
    const actor = p.data.asClient ? clientActor(p.data.asClient) : {
      id: session.staff.id, role: session.staff.role as Actor["role"],
      clearance: session.staff.sensitive_data_clearance === true, activeFrom: "2000-01-01",
    };
    if (actor.id !== q.toId) throw new HttpError(403, "Only the recipient may answer this question.");
    const qt: QuestionT = { ...q, dueAt: q.dueAt?.toISOString() ?? null } as unknown as QuestionT;
    const t = questionTransition(qt, "answer");
    if (!t.ok) throw new HttpError(t.code ?? 422, t.error ?? "Invalid.");
    const att = await tx.attachment.create({ data: { workspaceId: ws, kind: "note", text: p.data.text, uploadedBy: actor.id } });
    await tx.attachmentLink.create({ data: { workspaceId: ws, attachmentId: att.id, targetKind: q.targetKind, targetId: q.targetId } });
    await tx.question.update({ where: { id: q.id }, data: { status: "answered", answerAttachmentId: att.id } });
    await emitEvent(tx, { workspaceId: ws, actorId: actor.id, type: "question.answered", entityKind: "question", entityId: q.id, payload: { attachmentId: att.id } });
    await notify(tx, { ws, userId: q.fromId, type: "question.answered", entityId: q.id, at: new Date().toISOString() }, "A question was answered.");
  });
  revalidatePath("/questions");
}

export async function acceptQuestion(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const { actor, ws } = await staffActorAndWs();
  await guard(actor, "question.accept", { kind: "question" });
  await prisma.$transaction(async (tx) => {
    const q = await tx.question.findUnique({ where: { id } });
    if (!q) throw new HttpError(404, "Not found.");
    const t = questionTransition({ ...q, dueAt: null } as unknown as QuestionT, "accept");
    if (!t.ok) throw new HttpError(t.code ?? 422, t.error ?? "Invalid.");
    await tx.question.update({ where: { id }, data: { status: "accepted" } });
    await emitEvent(tx, { workspaceId: ws, actorId: actor.id, type: "question.accepted", entityKind: "question", entityId: id, payload: {} });
  });
  revalidatePath("/questions");
}

// ---- Review notes (5.3) -----------------------------------------------------
const NoteSchema = z.object({
  assigneeId: z.string().optional(),
  targetKind: z.string().min(1),
  targetId: z.string().min(1),
  severity: z.enum(["blocking", "non_blocking"]),
  text: z.string().min(3),
});

export async function createReviewNote(formData: FormData): Promise<void> {
  const { actor, ws } = await staffActorAndWs();
  await guard(actor, "reviewnote.create", { kind: "note" });
  const p = NoteSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) throw new HttpError(422, p.error.message);
  const d = p.data;
  await prisma.$transaction(async (tx) => {
    const n = await tx.reviewNote.create({
      data: { workspaceId: ws, authorId: actor.id, assigneeId: d.assigneeId || null, targetKind: d.targetKind, targetId: d.targetId, severity: d.severity, status: "open", thread: [{ by: actor.id, text: d.text, at: new Date().toISOString() }] as unknown as Prisma.InputJsonValue },
    });
    await emitEvent(tx, { workspaceId: ws, actorId: actor.id, type: "reviewnote.created", entityKind: "review_note", entityId: n.id, payload: { severity: d.severity } });
    if (d.assigneeId) await notify(tx, { ws, userId: d.assigneeId, type: "reviewnote.created", entityId: n.id, at: new Date().toISOString() }, "A review note was assigned to you.");
  });
  revalidatePath("/review");
}

const NoteTransSchema = z.object({ id: z.string(), action: z.enum(["address", "clear", "reopen"]) });

export async function transitionReviewNote(formData: FormData): Promise<void> {
  const p = NoteTransSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) throw new HttpError(422, p.error.message);
  const { actor, ws } = await staffActorAndWs();
  await prisma.$transaction(async (tx) => {
    const n = await tx.reviewNote.findUnique({ where: { id: p.data.id } });
    if (!n) throw new HttpError(404, "Not found.");
    const action = p.data.action === "address" ? "reviewnote.address" : "reviewnote.clear";
    await guard(actor, action as Action, { kind: "note", authorId: n.authorId, assigneeId: n.assigneeId });
    const nt: ReviewNoteT = { id: n.id, authorId: n.authorId, assigneeId: n.assigneeId, targetKind: n.targetKind, targetId: n.targetId, severity: n.severity as ReviewNoteT["severity"], status: n.status as ReviewNoteT["status"] };
    const t = noteTransition(nt, p.data.action);
    if (!t.ok) throw new HttpError(t.code ?? 422, t.error ?? "Invalid.");
    await tx.reviewNote.update({ where: { id: n.id }, data: { status: t.next! } });
    await emitEvent(tx, { workspaceId: ws, actorId: actor.id, type: `reviewnote.${t.next}`, entityKind: "review_note", entityId: n.id, payload: { action: p.data.action } });
    if (t.next === "cleared") await notify(tx, { ws, userId: n.authorId, type: "reviewnote.cleared", entityId: n.id, at: new Date().toISOString() }, "A review note was cleared.");
  });
  revalidatePath("/review");
}

// ---- Sign-offs (5.4) --------------------------------------------------------
const SignOffSchema = z.object({ level: z.enum(["preparer", "reviewer", "partner", "client", "quality"]), scope: z.enum(["area", "issue", "decision", "return", "form8879"]), coveredRefs: z.string().optional(), preparedBy: z.string().optional() });

export async function createSignOff(formData: FormData): Promise<void> {
  const { actor, ws } = await staffActorAndWs();
  const p = SignOffSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) throw new HttpError(422, p.error.message);
  const action = (`signoff.${p.data.level}`) as Action;
  await guard(actor, action, { kind: "signoff", preparedBy: p.data.preparedBy ?? null });
  const refs = (p.data.coveredRefs ?? "").split(/[,\s]+/).filter(Boolean);
  const world = await buildWorld();
  const hash = coveredHashFor({ scope: p.data.scope as SignScope, coveredRefs: refs }, world, resignPolicy());
  await prisma.$transaction(async (tx) => {
    const s = await tx.signOff.create({ data: { workspaceId: ws, level: p.data.level as SignLevel, scope: p.data.scope as SignScope, coveredRefs: refs, coveredHash: hash, signedBy: actor.id, status: "valid" } });
    await emitEvent(tx, { workspaceId: ws, actorId: actor.id, type: "signoff.signed", entityKind: "signoff", entityId: s.id, payload: { level: p.data.level, scope: p.data.scope } });
  });
  revalidatePath("/review");
}

export async function recomputeSignOffsAction(): Promise<void> {
  const { actor, ws } = await staffActorAndWs();
  const world = await buildWorld();
  const policy = resignPolicy();
  await prisma.$transaction(async (tx) => {
    const rows = await tx.signOff.findMany({ where: { workspaceId: ws } });
    const domain: SignOffT[] = rows.map((r) => ({ id: r.id, level: r.level as SignLevel, scope: r.scope as SignScope, coveredRefs: r.coveredRefs, coveredHash: r.coveredHash, signedBy: r.signedBy, signedAt: r.signedAt.toISOString(), status: r.status as SignOffT["status"] }));
    const { signoffs, reopenedIds } = recomputeSignOffs(domain, world, policy);
    for (const id of reopenedIds) {
      const s = signoffs.find((x) => x.id === id)!;
      await tx.signOff.update({ where: { id }, data: { status: "reopened", reopenReason: s.reopenReason, diff: s.diff } });
      await emitEvent(tx, { workspaceId: ws, actorId: actor.id, type: "signoff.reopened", entityKind: "signoff", entityId: id, payload: { reason: s.reopenReason } });
      await notify(tx, { ws, userId: s.signedBy, type: "signoff.reopened", entityId: id, at: new Date().toISOString() }, "A sign-off reopened: what you signed changed.");
    }
  });
  revalidatePath("/review");
}

// ---- Assignments + time (5.6) -----------------------------------------------
export async function reassign(formData: FormData): Promise<void> {
  const { actor, ws } = await staffActorAndWs();
  await guard(actor, "assignment.manage", { kind: "assignment" });
  const scopeKind = String(formData.get("scopeKind") ?? "engagement");
  const scopeId = String(formData.get("scopeId") ?? "engagement");
  const staffId = String(formData.get("staffId") ?? "");
  const role = String(formData.get("role") ?? "preparer");
  await prisma.$transaction(async (tx) => {
    await tx.assignment.updateMany({ where: { workspaceId: ws, scopeKind, scopeId, role, active: true }, data: { active: false } });
    const a = await tx.assignment.create({ data: { workspaceId: ws, scopeKind, scopeId, staffId, role, active: true } });
    await emitEvent(tx, { workspaceId: ws, actorId: actor.id, type: "assignment.changed", entityKind: "assignment", entityId: a.id, payload: { scopeKind, scopeId, staffId, role } });
    await notify(tx, { ws, userId: staffId, type: "assignment.changed", entityId: a.id, at: new Date().toISOString() }, `Assigned as ${role}.`);
  });
  revalidatePath("/team");
}

export async function logTime(formData: FormData): Promise<void> {
  const { actor, ws } = await staffActorAndWs();
  await guard(actor, "timeentry.log", { kind: "time" });
  const area = String(formData.get("area") ?? "");
  const minutes = Number(formData.get("minutes") ?? 0);
  if (!area || !Number.isFinite(minutes) || minutes <= 0) throw new HttpError(422, "Area and positive minutes required.");
  await prisma.$transaction(async (tx) => {
    const t = await tx.timeEntry.create({ data: { workspaceId: ws, staffId: actor.id, area, minutes, note: String(formData.get("note") ?? "") || null } });
    await emitEvent(tx, { workspaceId: ws, actorId: actor.id, type: "time.logged", entityKind: "time_entry", entityId: t.id, payload: { area, minutes } });
  });
  revalidatePath("/team");
}

// ---- Client 8879 signature (5.7) --------------------------------------------
const SignSchema = z.object({ signerClientId: z.enum(["cu-01", "cu-02"]), signer: z.enum(["taxpayer", "spouse"]) });

export async function signForm8879(formData: FormData): Promise<void> {
  const session = await getSession();
  const ws = session.workspaceId;
  if (await isFrozen(ws)) throw new HttpError(409, "Frozen: the return is filed.");
  const p = SignSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) throw new HttpError(422, p.error.message);
  const actor = clientActor(p.data.signerClientId);
  await guard(actor, "form8879.sign", { kind: "form8879", ownerClientId: p.data.signerClientId });
  const world = await buildWorld();
  const hash = coveredHashFor({ scope: "form8879", coveredRefs: [p.data.signer] }, world, resignPolicy());
  await prisma.$transaction(async (tx) => {
    const s = await tx.signOff.create({
      data: { workspaceId: ws, level: "client", scope: "form8879", coveredRefs: [p.data.signer], coveredHash: hash, signedBy: actor.id, status: "valid" },
    });
    await emitEvent(tx, { workspaceId: ws, actorId: actor.id, type: "form8879.signed", entityKind: "signoff", entityId: s.id, payload: { signer: p.data.signer, snapshotHash: hash } });
  });
  revalidatePath("/client");
  revalidatePath("/filing");
}

// ---- Masking view log (5.1) --------------------------------------------------
export async function recordUnmask(formData: FormData): Promise<void> {
  const { actor, ws } = await staffActorAndWs();
  await guard(actor, "unmask", { kind: "sensitive" });
  const field = String(formData.get("field") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  await prisma.$transaction(async (tx) => {
    const v = await tx.viewLog.create({ data: { workspaceId: ws, actorId: actor.id, field, entityId, reason: String(formData.get("reason") ?? "") || null } });
    await emitEvent(tx, { workspaceId: ws, actorId: actor.id, type: "unmask.viewed", entityKind: "view_log", entityId: v.id, payload: { field, entityId } });
  });
  revalidatePath("/admin/access");
}
