import "server-only";
import { prisma } from "./db";

// DB-backed workpaper reads/writes (Layer C). Reads degrade gracefully to empty
// when the database is not yet provisioned, so the evidence views still render
// before `npm run seed`. Writes go through the event log (see actions.ts).

export interface AttachmentView {
  id: string;
  kind: string;
  text: string | null;
  storageUri: string | null;
  uploadedBy: string | null;
  at: Date;
}

export async function listAttachments(targetKind: string, targetId: string): Promise<AttachmentView[]> {
  try {
    const links = await prisma.attachmentLink.findMany({
      where: { targetKind, targetId },
      include: { attachment: true },
      orderBy: { id: "desc" },
    });
    return links.map((l) => ({
      id: l.attachment.id,
      kind: l.attachment.kind,
      text: l.attachment.text,
      storageUri: l.attachment.storageUri,
      uploadedBy: l.attachment.uploadedBy,
      at: l.attachment.at,
    }));
  } catch {
    return [];
  }
}

export interface HumanVerificationView {
  id: string;
  status: string;
  verificationType: string | null;
  correctedValue: string | null;
  note: string | null;
  actorId: string | null;
  at: Date;
}

export async function listHumanVerifications(extractedValueId: string): Promise<HumanVerificationView[]> {
  try {
    return await prisma.verification.findMany({
      where: { extractedValueId, method: "human" },
      orderBy: { at: "desc" },
      select: { id: true, status: true, verificationType: true, correctedValue: true, note: true, actorId: true, at: true },
    });
  } catch {
    return [];
  }
}
