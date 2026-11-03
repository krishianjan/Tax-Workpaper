// "What changed since I last looked." Driven by the event SEQ (monotonic), never
// timestamps — so clock skew and same-second import events can't hide or
// duplicate entries (trap 9). "Mark seen" moves the cursor; opening a page does
// not.

export interface FeedEventRow {
  seq: number;
  at: string;
  actorId: string | null;
  type: string;
  entityKind: string;
  entityId: string;
  payload: unknown;
}

export interface FeedGroup {
  area: string;
  items: FeedEventRow[];
}

export interface Feed {
  sinceSeq: number;
  latestSeq: number;
  total: number;
  groups: FeedGroup[];
}

const AREA_BY_TYPE: Record<string, string> = {
  "adjustment.proposed": "Adjustments",
  "adjustment.reviewed": "Adjustments",
  "adjustment.approved": "Adjustments",
  "adjustment.rejected": "Adjustments",
  "adjustment.reverted": "Adjustments",
  "adjustment.stale": "Adjustments",
  "adjustment.absorbed": "Adjustments",
  "decision.proposed": "Decisions",
  "decision.approved": "Decisions",
  "decision.reopened": "Decisions",
  "engine.version": "Engine versions",
  "document.received": "Documents",
  "client.message": "Client messages",
  "checkrun.diff": "Check runs",
  "fact.corrected": "Corrections",
  "batch.applied": "Bulk actions",
  "batch.undone": "Bulk actions",
};

function areaFor(type: string): string {
  return AREA_BY_TYPE[type] ?? "Other";
}

/** Group events strictly after `afterSeq` by area, preserving seq order. */
export function buildFeed(events: FeedEventRow[], afterSeq: number): Feed {
  const fresh = events.filter((e) => e.seq > afterSeq).sort((a, b) => a.seq - b.seq);
  const byArea = new Map<string, FeedEventRow[]>();
  for (const e of fresh) {
    const area = areaFor(e.type);
    const arr = byArea.get(area) ?? [];
    arr.push(e);
    byArea.set(area, arr);
  }
  const latestSeq = events.reduce((m, e) => (e.seq > m ? e.seq : m), afterSeq);
  return {
    sinceSeq: afterSeq,
    latestSeq,
    total: fresh.length,
    groups: [...byArea.entries()].map(([area, items]) => ({ area, items })),
  };
}
