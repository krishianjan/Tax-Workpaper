import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Live feed source. Poll GET /api/events?after=<seq>. Returns events strictly
// after the seq (monotonic), so clients update without reload and never miss or
// duplicate same-second import events.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const after = Number(new URL(req.url).searchParams.get("after") ?? 0);
  try {
    const events = await prisma.event.findMany({
      where: { seq: { gt: Number.isFinite(after) ? after : 0 } },
      orderBy: { seq: "asc" },
      take: 200,
    });
    const latest = await prisma.event.findFirst({ orderBy: { seq: "desc" }, select: { seq: true } });
    return NextResponse.json({
      latestSeq: latest?.seq ?? 0,
      events: events.map((e) => ({
        seq: e.seq,
        at: e.at.toISOString(),
        actorId: e.actorId,
        type: e.type,
        entityKind: e.entityKind,
        entityId: e.entityId,
        payload: e.payload,
      })),
    });
  } catch {
    return NextResponse.json({ latestSeq: 0, events: [] });
  }
}
