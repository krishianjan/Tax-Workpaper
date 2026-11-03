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
  constructor(public code: number, msg: string) {
    super(msg);
  }
}

async function staffActor(): Promise<Actor> {
  const s = await getSession();
  const st = loadModel().staffById.get(s.staff.id);
  return { id: s.staff.id, role: s.staff.role as Actor["role"], clearance: s.staff.sensitive_data_clearance === true, activeFrom: (st as unknown as { active_from?: string })?.active_from ?? "2000-01-01" };
}

function snapshotHash(model: ReturnType<typeof loadModel>, versionId: string, totals: { taxFed: bigint; balanceFed: bigint; taxCa: bigint; balanceCa: bigint }): string {
  return createHash("sha256").update(`${versionId}|${totals.taxFed}|${totals.balanceFed}|${totals.taxCa}|${totals.balanceCa}`).digest("hex").slice(0, 24);
}

/**
 * Replay the scripted season up to the current as-of date, deterministically and
 * idempotently. Each timeline event drives DB artifacts (extension, submissions,
 * identity correction, filed snapshots + freeze, replay conflicts, the notice).
 * Stable ids make re-running a no-op.
 */
export async function replaySeason(): Promise<void> {
  const actor = await staffActor();
  const session = await getSession();
  const model = loadModel();
  const asOf = Date.parse(session.asOf);
  const adjustments = await loadAdjustments();
  const finalTotals = returnTotals(model, "v3", "final", adjustments);
  const hash = snapshotHash(model, "v3", finalTotals);

  const timeline = (model.raw.timeline as unknown as TimelineEvent[]).filter((e) => Date.parse(e.at) <= asOf);
  const efile = (model.raw.tax_agency_records as Record<string, unknown>).efile as Array<Record<string, unknown>>;

  await prisma.$transaction(async (tx) => {
    // Extension
    if (timeline.some((e) => e.event === "extension_filed_with_payment")) {
      const ext = buildExtension(model);
      if (ext && !(await tx.extension.findFirst())) {
        await tx.extension.create({ data: { form: ext.form, filedBy: ext.filedBy, basisVersion: ext.basisVersion, estimatedBalanceCents: ext.estimatedBalanceCents, paidCents: ext.paidCents, roundingRule: ext.roundingRule, note: ext.note } });
        await emitEvent(tx, { actorId: "st-02", type: "extension.filed", entityKind: "extension", entityId: "4868", payload: { paid: ext.paidCents.toString() } });
      }
    }

    // Submissions (immutable; keyed by agency submission id)
    for (const sub of efile) {
      if (Date.parse(String(sub.date)) > asOf) continue;
      const id = String(sub.submission_id);
      if (await tx.submission.findUnique({ where: { id } })) continue;
      await tx.submission.create({ data: { id, jurisdiction: String(sub.jurisdiction), snapshotHash: hash, status: String(sub.status), errors: (sub.errors ?? []) as Prisma.InputJsonValue, at: new Date(String(sub.date)) } });
      await emitEvent(tx, { actorId: actor.id, type: `submission.${sub.status}`, entityKind: "submission", entityId: id, payload: { jurisdiction: String(sub.jurisdiction) } });
    }

    // Identity correction on tl-22 (D71 + msg-10): 666-74-3309 -> 666-74-3390
    if (timeline.some((e) => e.id === "tl-22")) {
      const exists = await tx.factCorrection.findFirst({ where: { extractedValueId: "household:theo:ssn" } });
      if (!exists) {
        await tx.factCorrection.create({ data: { extractedValueId: "household:theo:ssn", original: "666-74-3309", corrected: "666-74-3390", verificationType: "agreed_to_source_document", reason: "SS card (D71) + client msg-10; matches the 2024 return.", evidenceIds: ["D71", "msg-10"], actorId: actor.id } });
        await emitEvent(tx, { actorId: actor.id, type: "fact.corrected", entityKind: "household", entityId: "theo", payload: { field: "ssn", from: "***3309", to: "***3390" } });
      }
    }

    // Filing status + filed snapshots + freeze on acceptance
    const setStatus = async (j: string, state: string) => {
      await tx.filingStatus.upsert({ where: { jurisdiction: j }, create: { jurisdiction: j, state }, update: { state } });
    };
    const fedAccepted = efile.some((s) => s.jurisdiction === "federal" && s.status === "accepted" && Date.parse(String(s.date)) <= asOf);
    const caAccepted = efile.some((s) => s.jurisdiction === "california" && s.status === "accepted" && Date.parse(String(s.date)) <= asOf);
    if (fedAccepted) {
      await setStatus("federal", "frozen");
      if (!(await tx.snapshot.findFirst({ where: { label: "filed-federal" } }))) {
        await tx.snapshot.create({ data: { label: "filed-federal", kind: "filed", eventSeq: 0, asOf: new Date(session.asOf), contentHash: hash, lines: {} } });
        await emitEvent(tx, { actorId: actor.id, type: "return.frozen", entityKind: "snapshot", entityId: "filed-federal", payload: { jurisdiction: "federal", hash } });
      }
    }
    if (caAccepted) {
      await setStatus("california", "frozen");
      if (!(await tx.snapshot.findFirst({ where: { label: "filed-california" } }))) {
        await tx.snapshot.create({ data: { label: "filed-california", kind: "filed", eventSeq: 0, asOf: new Date(session.asOf), contentHash: hash, lines: {} } });
        await emitEvent(tx, { actorId: actor.id, type: "return.frozen", entityKind: "snapshot", entityId: "filed-california", payload: { jurisdiction: "california", hash } });
      }
    }

    // tl-25 ReplayConflict: scripted balance paid vs overpayment final
    if (timeline.some((e) => e.id === "tl-25")) {
      const conflict = detectReplayConflict({ id: "tl-25", at: "2026-07-20T14:00:00Z", event: "federal_balance_paid", actor: null, refs: [] }, finalTotals.balanceFed);
      if (conflict && !(await tx.replayConflict.findFirst({ where: { eventId: "tl-25" } }))) {
        await tx.replayConflict.create({ data: { eventId: conflict.eventId, scripted: conflict.scripted, finalState: conflict.finalState, resolution: conflict.resolution, note: conflict.note } });
        await emitEvent(tx, { actorId: actor.id, type: "replay.conflict", entityKind: "replay_conflict", entityId: "tl-25", payload: { resolution: conflict.resolution } });
      }
    }

    // tl-29 Notice
    if (timeline.some((e) => e.id === "tl-29")) {
      const notices = (model.raw.tax_agency_records as Record<string, unknown>).notices as Array<Record<string, unknown>>;
      const l566 = notices.find((n) => n.id === "N-2025-L566");
      if (l566 && !(await tx.notice.findUnique({ where: { id: "N-2025-L566" } }))) {
        await tx.notice.create({ data: { id: "N-2025-L566", agency: String(l566.agency), type: String(l566.type), taxYear: Number(l566.tax_year), dated: new Date(String(l566.dated)), responseDue: l566.response_due ? new Date(String(l566.response_due)) : null, items: (l566.items_under_examination ?? []) as Prisma.InputJsonValue, legalHold: true } });
        await emitEvent(tx, { actorId: actor.id, type: "notice.received", entityKind: "notice", entityId: "N-2025-L566", payload: {} });
      }
    }
  }, { timeout: 60000 });

  revalidatePath("/filing");
  revalidatePath("/amendments");
  revalidatePath("/rollforward");
}

/** Reset the replayed season artifacts (unfreezes so the workpaper is editable). */
export async function resetSeason(): Promise<void> {
  const actor = await staffActor();
  await prisma.$transaction(async (tx) => {
    await tx.submission.deleteMany({});
    await tx.extension.deleteMany({});
    await tx.replayConflict.deleteMany({});
    await tx.notice.deleteMany({});
    await tx.amendmentCase.deleteMany({});
    await tx.filingStatus.deleteMany({});
    await tx.snapshot.deleteMany({ where: { kind: "filed" } });
    await tx.factCorrection.deleteMany({ where: { extractedValueId: "household:theo:ssn" } });
    await emitEvent(tx, { actorId: actor.id, type: "season.reset", entityKind: "season", entityId: "replay", payload: {} });
  });
  revalidatePath("/filing");
}

/** Open an amendment on a filed jurisdiction. The filed snapshot is the base and
 *  is never mutated. */
export async function openAmendment(formData: FormData): Promise<void> {
  const actor = await staffActor();
  const d = can(actor, "amendment.open", { kind: "amendment" }, { now: new Date().toISOString() });
  if (!d.allow) throw new HttpError(403, d.reason);
  const jurisdiction = String(formData.get("jurisdiction") ?? "federal");
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 5) throw new HttpError(422, "An amendment needs a reason.");
  const filed = await prisma.snapshot.findFirst({ where: { label: `filed-${jurisdiction}` } });
  if (!filed) throw new HttpError(422, "That jurisdiction is not filed yet.");
  await prisma.$transaction(async (tx) => {
    const a = await tx.amendmentCase.create({ data: { jurisdiction, reason, baseSnapshotId: filed.id, baseSnapshotHash: filed.contentHash, openedBy: actor.id, status: "open" } });
    await emitEvent(tx, { actorId: actor.id, type: "amendment.opened", entityKind: "amendment", entityId: a.id, payload: { jurisdiction, base: filed.contentHash } });
  });
  revalidatePath("/amendments");
}
