"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { emitEvent } from "@/lib/event";
import { getSession } from "@/lib/session";
import { loadModel } from "@/lib/packet/load";
import { loadAdjustments } from "@/lib/change/store";
import { returnTotals } from "@/lib/change/effective";
import { can, type Actor } from "@/lib/people/permissions";
import { buildExtension } from "@/lib/filing/extension";
import { detectReplayConflict, type TimelineEvent } from "@/lib/filing/replay";

class HttpError extends Error {
  constructor(public code: number, msg: string) { super(msg); }
}

async function staffActorAndWs(): Promise<{ actor: Actor; ws: string }> {
  const s = await getSession();
  const st = loadModel().staffById.get(s.staff.id);
  return {
    actor: { id: s.staff.id, role: s.staff.role as Actor["role"], clearance: s.staff.sensitive_data_clearance === true, activeFrom: (st as unknown as { active_from?: string })?.active_from ?? "2000-01-01" },
    ws: s.workspaceId,
  };
}

function snapshotHash(model: ReturnType<typeof loadModel>, versionId: string, totals: { taxFed: bigint; balanceFed: bigint; taxCa: bigint; balanceCa: bigint }): string {
  return createHash("sha256").update(`${versionId}|${totals.taxFed}|${totals.balanceFed}|${totals.taxCa}|${totals.balanceCa}`).digest("hex").slice(0, 24);
}

export async function replaySeason(): Promise<void> {
  const { actor, ws } = await staffActorAndWs();
  const session = await getSession();
  const model = loadModel();
  const asOf = Date.parse(session.asOf);
  const adjustments = await loadAdjustments(ws);
  const finalTotals = returnTotals(model, "v3", "final", adjustments);
  const hash = snapshotHash(model, "v3", finalTotals);

  const timeline = (model.raw.timeline as unknown as TimelineEvent[]).filter((e) => Date.parse(e.at) <= asOf);
  const efile = (model.raw.tax_agency_records as Record<string, unknown>).efile as Array<Record<string, unknown>>;

  await prisma.$transaction(async (tx) => {
    if (timeline.some((e) => e.event === "extension_filed_with_payment")) {
      const ext = buildExtension(model);
      if (ext && !(await tx.extension.findFirst({ where: { workspaceId: ws } }))) {
        await tx.extension.create({ data: { workspaceId: ws, form: ext.form, filedBy: ext.filedBy, basisVersion: ext.basisVersion, estimatedBalanceCents: ext.estimatedBalanceCents, paidCents: ext.paidCents, roundingRule: ext.roundingRule, note: ext.note } });
        await emitEvent(tx, { workspaceId: ws, actorId: "st-02", type: "extension.filed", entityKind: "extension", entityId: "4868", payload: { paid: ext.paidCents.toString() } });
      }
    }

    for (const sub of efile) {
      if (Date.parse(String(sub.date)) > asOf) continue;
      const id = String(sub.submission_id);
      if (await tx.submission.findUnique({ where: { id } })) continue;
      await tx.submission.create({ data: { workspaceId: ws, id, jurisdiction: String(sub.jurisdiction), snapshotHash: hash, status: String(sub.status), errors: (sub.errors ?? []) as Prisma.InputJsonValue, at: new Date(String(sub.date)) } });
      await emitEvent(tx, { workspaceId: ws, actorId: actor.id, type: `submission.${sub.status}`, entityKind: "submission", entityId: id, payload: { jurisdiction: String(sub.jurisdiction) } });
    }

    if (timeline.some((e) => e.id === "tl-22")) {
      const exists = await tx.factCorrection.findFirst({ where: { extractedValueId: "household:theo:ssn", workspaceId: ws } });
      if (!exists) {
        await tx.factCorrection.create({ data: { workspaceId: ws, extractedValueId: "household:theo:ssn", original: "666-74-3309", corrected: "666-74-3390", verificationType: "agreed_to_source_document", reason: "SS card (D71) + client msg-10; matches the 2024 return.", evidenceIds: ["D71", "msg-10"], actorId: actor.id } });
        await emitEvent(tx, { workspaceId: ws, actorId: actor.id, type: "fact.corrected", entityKind: "household", entityId: "theo", payload: { field: "ssn", from: "***3309", to: "***3390" } });
      }
    }

    const setStatus = async (j: string, state: string) => {
      await tx.filingStatus.upsert({ where: { workspaceId_jurisdiction: { workspaceId: ws, jurisdiction: j } }, create: { workspaceId: ws, jurisdiction: j, state }, update: { state } });
    };
    const fedAccepted = efile.some((s) => s.jurisdiction === "federal" && s.status === "accepted" && Date.parse(String(s.date)) <= asOf);
    const caAccepted = efile.some((s) => s.jurisdiction === "california" && s.status === "accepted" && Date.parse(String(s.date)) <= asOf);
    if (fedAccepted) {
      await setStatus("federal", "frozen");
      if (!(await tx.snapshot.findFirst({ where: { label: "filed-federal", workspaceId: ws } }))) {
        await tx.snapshot.create({ data: { workspaceId: ws, label: "filed-federal", kind: "filed", eventSeq: 0, asOf: new Date(session.asOf), contentHash: hash, lines: {} } });
        await emitEvent(tx, { workspaceId: ws, actorId: actor.id, type: "return.frozen", entityKind: "snapshot", entityId: "filed-federal", payload: { jurisdiction: "federal", hash } });
      }
    }
    if (caAccepted) {
      await setStatus("california", "frozen");
      if (!(await tx.snapshot.findFirst({ where: { label: "filed-california", workspaceId: ws } }))) {
        await tx.snapshot.create({ data: { workspaceId: ws, label: "filed-california", kind: "filed", eventSeq: 0, asOf: new Date(session.asOf), contentHash: hash, lines: {} } });
        await emitEvent(tx, { workspaceId: ws, actorId: actor.id, type: "return.frozen", entityKind: "snapshot", entityId: "filed-california", payload: { jurisdiction: "california", hash } });
      }
    }

    if (timeline.some((e) => e.id === "tl-25")) {
      const conflict = detectReplayConflict({ id: "tl-25", at: "2026-07-20T14:00:00Z", event: "federal_balance_paid", actor: null, refs: [] }, finalTotals.balanceFed);
      if (conflict && !(await tx.replayConflict.findFirst({ where: { eventId: "tl-25", workspaceId: ws } }))) {
        await tx.replayConflict.create({ data: { workspaceId: ws, eventId: conflict.eventId, scripted: conflict.scripted, finalState: conflict.finalState, resolution: conflict.resolution, note: conflict.note } });
        await emitEvent(tx, { workspaceId: ws, actorId: actor.id, type: "replay.conflict", entityKind: "replay_conflict", entityId: "tl-25", payload: { resolution: conflict.resolution } });
      }
    }

    if (timeline.some((e) => e.id === "tl-29")) {
      const notices = (model.raw.tax_agency_records as Record<string, unknown>).notices as Array<Record<string, unknown>>;
      const l566 = notices.find((n) => n.id === "N-2025-L566");
      if (l566 && !(await tx.notice.findUnique({ where: { id: "N-2025-L566" } }))) {
        await tx.notice.create({ data: { workspaceId: ws, id: "N-2025-L566", agency: String(l566.agency), type: String(l566.type), taxYear: Number(l566.tax_year), dated: new Date(String(l566.dated)), responseDue: l566.response_due ? new Date(String(l566.response_due)) : null, items: (l566.items_under_examination ?? []) as Prisma.InputJsonValue, legalHold: true } });
        await emitEvent(tx, { workspaceId: ws, actorId: actor.id, type: "notice.received", entityKind: "notice", entityId: "N-2025-L566", payload: {} });
      }
    }
  }, { timeout: 60000 });

  revalidatePath("/filing");
  revalidatePath("/amendments");
  revalidatePath("/rollforward");
}

export async function resetSeason(): Promise<void> {
  const { actor, ws } = await staffActorAndWs();
  await prisma.$transaction(async (tx) => {
    await tx.submission.deleteMany({ where: { workspaceId: ws } });
    await tx.extension.deleteMany({ where: { workspaceId: ws } });
    await tx.replayConflict.deleteMany({ where: { workspaceId: ws } });
    await tx.notice.deleteMany({ where: { workspaceId: ws } });
    await tx.amendmentCase.deleteMany({ where: { workspaceId: ws } });
    await tx.filingStatus.deleteMany({ where: { workspaceId: ws } });
    await tx.snapshot.deleteMany({ where: { kind: "filed", workspaceId: ws } });
    await tx.factCorrection.deleteMany({ where: { extractedValueId: "household:theo:ssn", workspaceId: ws } });
    await emitEvent(tx, { workspaceId: ws, actorId: actor.id, type: "season.reset", entityKind: "season", entityId: "replay", payload: {} });
  });
  revalidatePath("/filing");
}

export async function openAmendment(formData: FormData): Promise<void> {
  const { actor, ws } = await staffActorAndWs();
  const d = can(actor, "amendment.open", { kind: "amendment" }, { now: new Date().toISOString() });
  if (!d.allow) throw new HttpError(403, d.reason);
  const jurisdiction = String(formData.get("jurisdiction") ?? "federal");
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 5) throw new HttpError(422, "An amendment needs a reason.");
  const filed = await prisma.snapshot.findFirst({ where: { label: `filed-${jurisdiction}`, workspaceId: ws } });
  if (!filed) throw new HttpError(422, "That jurisdiction is not filed yet.");
  await prisma.$transaction(async (tx) => {
    const a = await tx.amendmentCase.create({ data: { workspaceId: ws, jurisdiction, reason, baseSnapshotId: filed.id, baseSnapshotHash: filed.contentHash, openedBy: actor.id, status: "open" } });
    await emitEvent(tx, { workspaceId: ws, actorId: actor.id, type: "amendment.opened", entityKind: "amendment", entityId: a.id, payload: { jurisdiction, base: filed.contentHash } });
  });
  revalidatePath("/amendments");
}
