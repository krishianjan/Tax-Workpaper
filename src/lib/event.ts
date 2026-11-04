import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { DEFAULT_WORKSPACE } from "./session";

// Append-only event log with a per-workspace hash chain, so tampering is
// detectable. seq is a global autoincrement (preserves global ordering); the
// hash chain is scoped: prevHash is the last event in the same workspace.

export interface EmitInput {
  workspaceId?: string;
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

/** Append an event, chaining its hash to the previous event in the same workspace. */
export async function emitEvent(tx: Tx, input: EmitInput): Promise<string> {
  const wsId = input.workspaceId ?? DEFAULT_WORKSPACE;
  const last = await tx.event.findFirst({
    where: { workspaceId: wsId },
    orderBy: { seq: "desc" },
    select: { hash: true },
  });
  const prevHash = last?.hash ?? null;
  const material = canonical({
    workspaceId: wsId,
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
      workspaceId: wsId,
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

/** Verify the chain for a single workspace. Returns the first broken seq, or null. */
export async function verifyChain(tx: Tx, workspaceId: string = DEFAULT_WORKSPACE): Promise<number | null> {
  const events = await tx.event.findMany({
    where: { workspaceId },
    orderBy: { seq: "asc" },
  });
  let prevHash: string | null = null;
  for (const e of events) {
    const material = canonical({
      workspaceId,
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
