import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

// Append-only event log with a hash chain, so tampering is detectable. Every
// workpaper write emits exactly one event. seq is monotonic (DB autoincrement).

export interface EmitInput {
  actorId?: string | null;
  type: string;
  entityKind: string;
  entityId: string;
  payload: Prisma.InputJsonValue;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(obj[k])).join(",") + "}";
}

type Tx = PrismaClient | Prisma.TransactionClient;

/** Append an event, chaining its hash to the previous event's hash. */
export async function emitEvent(tx: Tx, input: EmitInput): Promise<string> {
  const last = await tx.event.findFirst({ orderBy: { seq: "desc" }, select: { hash: true } });
  const prevHash = last?.hash ?? null;
  const material = canonical({
    prevHash,
    type: input.type,
    entityKind: input.entityKind,
    entityId: input.entityId,
    actorId: input.actorId ?? null,
    payload: input.payload,
  });
  const hash = createHash("sha256").update(material).digest("hex");
  const row = await tx.event.create({
    data: {
      actorId: input.actorId ?? null,
      type: input.type,
      entityKind: input.entityKind,
      entityId: input.entityId,
      payload: input.payload,
      prevHash,
      hash,
    },
  });
  return row.id;
}

/** Verify the whole chain is intact. Returns the first broken seq, or null. */
export async function verifyChain(tx: Tx): Promise<number | null> {
  const events = await tx.event.findMany({ orderBy: { seq: "asc" } });
  let prevHash: string | null = null;
  for (const e of events) {
    const material = canonical({
      prevHash,
      type: e.type,
      entityKind: e.entityKind,
      entityId: e.entityId,
      actorId: e.actorId ?? null,
      payload: e.payload,
    });
    const expected = createHash("sha256").update(material).digest("hex");
    if (e.prevHash !== prevHash || e.hash !== expected) return e.seq;
    prevHash = e.hash;
  }
  return null;
}
