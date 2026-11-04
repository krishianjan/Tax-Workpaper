import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { buildFeed, type FeedEventRow } from "@/lib/change/feed";
import { markSeen } from "@/app/change-actions";
import { SectionTitle } from "@/components/ui";
import LivePoller from "@/components/LivePoller";

async function loadEvents(): Promise<{ rows: FeedEventRow[]; cursor: number }> {
  try {
    const session = await getSession();
    const [events, cur] = await Promise.all([
      prisma.event.findMany({ where: { workspaceId: session.workspaceId }, orderBy: { seq: "asc" }, take: 1000 }),
      prisma.userCursor.findUnique({ where: { userId: session.staff.id } }),
    ]);
    return {
      rows: events.map((e) => ({
        seq: e.seq,
        at: e.at.toISOString(),
        actorId: e.actorId,
        type: e.type,
        entityKind: e.entityKind,
        entityId: e.entityId,
        payload: e.payload,
      })),
      cursor: cur?.lastSeenSeq ?? 0,
    };
  } catch {
    return { rows: [], cursor: 0 };
  }
}

export default async function ChangesPage() {
  const { rows, cursor } = await loadEvents();
  const feed = buildFeed(rows, cursor);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Since I last looked</h1>
        <div className="flex items-center gap-2">
          <LivePoller latestSeq={feed.latestSeq} />
          <form action={markSeen}>
            <input type="hidden" name="seq" value={feed.latestSeq} />
            <button className="rounded bg-slate-900 px-3 py-1 text-sm text-white">Mark seen (seq {feed.latestSeq})</button>
          </form>
        </div>
      </div>
      <p className="text-sm text-slate-500">
        {feed.total} new event(s) since seq {feed.sinceSeq}. Driven by event sequence, not timestamps. Opening this page
        does not move your cursor.
      </p>

      {feed.groups.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing new. You&apos;re caught up.</p>
      ) : (
        feed.groups.map((g) => (
          <section key={g.area}>
            <SectionTitle>
              {g.area} ({g.items.length})
            </SectionTitle>
            <ul className="space-y-1 text-sm">
              {g.items.map((e) => (
                <li key={e.seq} className="card flex items-center justify-between p-2">
                  <span>
                    <span className="mono text-xs text-slate-400">#{e.seq}</span> <span className="font-medium">{e.type}</span>{" "}
                    <span className="text-slate-500">{e.entityKind} {e.entityId}</span>
                  </span>
                  <span className="text-xs text-slate-400">{e.actorId ?? "system"} · {e.at.slice(0, 16).replace("T", " ")}</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
