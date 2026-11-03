"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { emitEvent } from "@/lib/event";
import { getSession } from "@/lib/session";
import { loadModel } from "@/lib/packet/load";
import { can, type Actor, type Action, type Resource } from "@/lib/people/permissions";
import { isFrozen } from "@/lib/change/store";
import { loadActiveStandard } from "@/lib/firm/store";
import { diffStandards, type StandardContent } from "@/lib/firm/standards";
import { encryptField, decryptField, maskToken, canReveal, type Encrypted } from "@/lib/firm/sensitive";
import { collectSensitiveFields } from "@/lib/firm/sensitiveCatalog";
import { canDeactivate, clearanceChangeEvent, type OpenItemRef } from "@/lib/firm/staffLifecycle";
import { openItemsFor } from "@/lib/firm/store";

class HttpError extends Error {
  constructor(public code: number, msg: string) {
    super(msg);
  }
}

async function staffActor(): Promise<Actor> {
  const s = await getSession();
  const st = loadModel().staffById.get(s.staff.id);
  return {
    id: s.staff.id,
    role: s.staff.role as Actor["role"],
    clearance: s.staff.sensitive_data_clearance === true,
    activeFrom: (st as unknown as { active_from?: string })?.active_from ?? "2000-01-01",
  };
}

async function guard(actor: Actor, action: Action, resource: Resource): Promise<void> {
  const frozen = await isFrozen();
  const d = can(actor, action, resource, { now: new Date().toISOString(), frozen });
  if (!d.allow) throw new HttpError(403, d.reason);
}

// ---- 7.1 Firm standards: admin edit creates a new version -------------------
const EditStandardSchema = z.object({
  partnerThreshold: z.coerce.number().positive().optional(),
  retentionYears: z.coerce.number().int().positive().optional(),
  confidenceThreshold: z.coerce.number().min(0).max(1).optional(),
  resignOn: z.enum(["amounts", "amounts_and_identity"]).optional(),
  note: z.string().optional(),
});

export async function editStandard(formData: FormData): Promise<void> {
  const actor = await staffActor();
  // Edits are blocked for frozen engagements; the guard enforces standards.manage.
  await guard(actor, "standards.manage", { kind: "standard" });

  const p = EditStandardSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) throw new HttpError(422, p.error.message);

  const current = await loadActiveStandard();
  const next: StandardContent = {
    ...current,
    partnerThreshold: p.data.partnerThreshold ?? current.partnerThreshold,
    retentionYears: p.data.retentionYears ?? current.retentionYears,
    confidenceThreshold: p.data.confidenceThreshold ?? current.confidenceThreshold,
    resignOn: p.data.resignOn ?? current.resignOn,
  };
  const changes = diffStandards(current, next);
  if (changes.length === 0) throw new HttpError(422, "No changes.");

  await prisma.$transaction(async (tx) => {
    await tx.firmStandard.updateMany({ where: { active: true }, data: { active: false } });
    const row = await tx.firmStandard.create({
      data: { content: next as unknown as object, createdBy: actor.id, note: p.data.note ?? null, active: true },
    });
    await emitEvent(tx, {
      actorId: actor.id,
      type: "standard.versioned",
      entityKind: "firm_standard",
      entityId: String(row.version),
      payload: { changes: changes.map((c) => c.field) },
    });
  });
  revalidatePath("/admin/standards");
}

// ---- 7.2 Sensitive values: seed the encrypted store (first-run / admin) -----
export async function seedSensitiveStore(): Promise<void> {
  const actor = await staffActor();
  await guard(actor, "staff.manage", { kind: "sensitive" });
  const fields = collectSensitiveFields(loadModel());
  await prisma.$transaction(async (tx) => {
    for (const f of fields) {
      const enc = encryptField(f.plaintext);
      await tx.sensitiveValue.upsert({
        where: { ref: f.ref },
        update: {},
        create: {
          ref: f.ref,
          kind: f.kind,
          ciphertext: enc.ciphertext,
          iv: enc.iv,
          authTag: enc.authTag,
          maskToken: maskToken(f.kind, f.plaintext),
          ownerEntity: f.ownerEntity,
        },
      });
    }
    await emitEvent(tx, { actorId: actor.id, type: "sensitive.seeded", entityKind: "sensitive", entityId: "store", payload: { count: fields.length } });
  });
  revalidatePath("/admin/access");
}

// ---- 7.2 Reveal a single sensitive value (clearance + reason + ViewLog) -----
const RevealSchema = z.object({ ref: z.string().min(3), reason: z.string().min(3) });

/** Returns the plaintext for THIS response only. Never cached, never stored. */
export async function revealSensitive(formData: FormData): Promise<string> {
  const actor = await staffActor();
  const p = RevealSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) throw new HttpError(422, "A reason is required.");

  const gate = canReveal(
    { id: actor.id, clearance: actor.clearance, activeFrom: actor.activeFrom, assignedEngagementIds: ["okafor-lindqvist-2025"] },
    { now: new Date().toISOString(), reason: p.data.reason, engagementId: "okafor-lindqvist-2025" },
  );
  // A denial never reveals whether the value exists.
  if (!gate.allow) throw new HttpError(403, gate.reason);

  const row = await prisma.sensitiveValue.findUnique({ where: { ref: p.data.ref } });
  if (!row) throw new HttpError(404, "No such value."); // same shape for cleared users only

  const plaintext = decryptField({ ciphertext: row.ciphertext, iv: row.iv, authTag: row.authTag } as Encrypted);

  await prisma.$transaction(async (tx) => {
    const v = await tx.viewLog.create({ data: { actorId: actor.id, field: row.kind, entityId: p.data.ref, reason: p.data.reason } });
    await emitEvent(tx, { actorId: actor.id, type: "sensitive.revealed", entityKind: "view_log", entityId: v.id, payload: { ref: p.data.ref, kind: row.kind } });
  });
  revalidatePath("/admin/access");
  return plaintext;
}

export interface RevealState {
  ok: boolean;
  ref?: string;
  value?: string;
  error?: string;
}

/** Form-friendly wrapper for useActionState: never throws, returns the plaintext
 *  for display this one response only. */
export async function revealSensitiveAction(_prev: RevealState, formData: FormData): Promise<RevealState> {
  try {
    const ref = String(formData.get("ref") ?? "");
    const value = await revealSensitive(formData);
    return { ok: true, ref, value };
  } catch (e) {
    return { ok: false, error: e instanceof HttpError ? e.message : "Unable to reveal." };
  }
}

// ---- 7.4 Staff lifecycle ----------------------------------------------------
const DeactivateSchema = z.object({ staffId: z.string().min(1) });

export async function deactivateStaff(formData: FormData): Promise<void> {
  const actor = await staffActor();
  await guard(actor, "staff.manage", { kind: "staff" });
  const p = DeactivateSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) throw new HttpError(422, p.error.message);

  const open = (await openItemsFor(p.data.staffId)) as OpenItemRef[];
  const decision = canDeactivate(p.data.staffId, open);
  if (!decision.allow) throw new HttpError(409, decision.reason);

  const now = new Date().toISOString();
  await prisma.$transaction(async (tx) => {
    await tx.staffState.upsert({
      where: { staffId: p.data.staffId },
      update: { active: false, deactivatedAt: new Date(now) },
      create: { staffId: p.data.staffId, active: false, deactivatedAt: new Date(now), clearance: false },
    });
    // Revoke sessions by invalidating any active assignments (forces reassignment flow).
    await tx.assignment.updateMany({ where: { staffId: p.data.staffId, active: true }, data: { active: false } });
    await emitEvent(tx, { actorId: actor.id, type: "staff.deactivated", entityKind: "staff", entityId: p.data.staffId, payload: { at: now } });
  });
  revalidatePath("/admin/staff");
}

const ClearanceSchema = z.object({ staffId: z.string().min(1), clearance: z.coerce.boolean() });

export async function changeClearance(formData: FormData): Promise<void> {
  const actor = await staffActor();
  await guard(actor, "staff.manage", { kind: "staff" });
  const p = ClearanceSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) throw new HttpError(422, p.error.message);

  const current = loadModel().staffById.get(p.data.staffId)?.sensitive_data_clearance === true;
  const now = new Date().toISOString();
  await prisma.$transaction(async (tx) => {
    await tx.staffState.upsert({
      where: { staffId: p.data.staffId },
      update: { clearance: p.data.clearance },
      create: { staffId: p.data.staffId, active: true, clearance: p.data.clearance },
    });
    const ev = clearanceChangeEvent({ staffId: p.data.staffId, from: current, to: p.data.clearance, by: actor.id, at: now });
    await emitEvent(tx, {
      actorId: actor.id,
      type: ev.type,
      entityKind: ev.entityKind,
      entityId: ev.entityId,
      payload: { from: current, to: p.data.clearance, by: actor.id, at: now },
    });
  });
  revalidatePath("/admin/staff");
}
