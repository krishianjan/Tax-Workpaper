"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { emitEvent } from "@/lib/event";
import { getSession } from "@/lib/session";

export async function setSession(formData: FormData): Promise<void> {
  const role = String(formData.get("role") ?? "st-01");
  const asOf = String(formData.get("asOf") ?? "");
  const jar = await cookies();
  jar.set("wp_role", role, { httpOnly: false, sameSite: "lax", path: "/" });
  if (asOf) jar.set("wp_asof", asOf, { httpOnly: false, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}

const NoteSchema = z.object({
  targetKind: z.enum(["document", "extracted_value", "line", "check_result"]),
  targetId: z.string().min(1),
  text: z.string().min(1).max(5000),
});

/** Attach a note as evidence to a document, value, line or check result. */
export async function addNote(formData: FormData): Promise<void> {
  const parsed = NoteSchema.safeParse({
    targetKind: formData.get("targetKind"),
    targetId: formData.get("targetId"),
    text: formData.get("text"),
  });
  if (!parsed.success) throw new Error("Invalid note: " + parsed.error.issues.map((i) => i.message).join(", "));
  const { targetKind, targetId, text } = parsed.data;
  const session = await getSession();

  await prisma.$transaction(async (tx) => {
    const att = await tx.attachment.create({
      data: { kind: "note", text, uploadedBy: session.staff.id },
    });
    await tx.attachmentLink.create({ data: { attachmentId: att.id, targetKind, targetId } });
    await emitEvent(tx, {
      actorId: session.staff.id,
      type: "attachment.added",
      entityKind: targetKind,
      entityId: targetId,
      payload: { attachmentId: att.id, kind: "note" },
    });
  });
  revalidatePath(`/doc/${targetKind === "document" ? targetId : ""}`);
  revalidatePath("/", "layout");
}

const VerifySchema = z.object({
  extractedValueId: z.string().min(1),
  verificationType: z.string().min(1),
  status: z.enum(["human_verified", "human_corrected"]),
  correctedValue: z.string().max(500).optional(),
  note: z.string().max(2000).optional(),
});

/** Record a human verification. The original extraction is never mutated. */
export async function addHumanVerification(formData: FormData): Promise<void> {
  const parsed = VerifySchema.safeParse({
    extractedValueId: formData.get("extractedValueId"),
    verificationType: formData.get("verificationType"),
    status: formData.get("status"),
    correctedValue: formData.get("correctedValue") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) throw new Error("Invalid verification: " + parsed.error.issues.map((i) => i.message).join(", "));
  const d = parsed.data;
  const session = await getSession();

  await prisma.$transaction(async (tx) => {
    await tx.verification.create({
      data: {
        extractedValueId: d.extractedValueId,
        status: d.status,
        method: "human",
        verificationType: d.verificationType,
        correctedValue: d.correctedValue ?? null,
        note: d.note ?? null,
        actorId: session.staff.id,
      },
    });
    await emitEvent(tx, {
      actorId: session.staff.id,
      type: "verification.recorded",
      entityKind: "extracted_value",
      entityId: d.extractedValueId,
      payload: { status: d.status, verificationType: d.verificationType, correctedValue: d.correctedValue ?? null },
    });
  });
  revalidatePath("/", "layout");
}
