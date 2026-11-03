import "server-only";
import { prisma } from "../db";
import { loadModel } from "../packet/load";
import { seedFromPacket, type StandardContent, type VersionedStandard } from "./standards";
import type { TimeEntryT } from "./budget";
import type { StaffActiveState } from "./staffLifecycle";

// DB-tolerant reads for Feature 7. Everything falls back cleanly when there is
// no database (unit tests), mirroring the Block 1-3 store pattern.

/** The active firm standard. Falls back to version 0 seeded from the packet so
 *  the app works on an empty DB (the import seeds version 1). */
export async function loadActiveStandard(): Promise<VersionedStandard> {
  const seed = seedFromPacket(loadModel());
  try {
    const row = await prisma.firmStandard.findFirst({ where: { active: true }, orderBy: { version: "desc" } });
    if (row) return { version: row.version, createdBy: row.createdBy, note: row.note, ...(row.content as unknown as StandardContent) };
  } catch {
    /* ignore */
  }
  return { version: 0, createdBy: null, note: "seed (packet starter_standards)", ...seed };
}

export async function loadStandardHistory(): Promise<VersionedStandard[]> {
  try {
    const rows = await prisma.firmStandard.findMany({ orderBy: { version: "desc" } });
    return rows.map((r) => ({ version: r.version, createdBy: r.createdBy, note: r.note, ...(r.content as unknown as StandardContent) }));
  } catch {
    return [];
  }
}

export async function loadTimeEntries(): Promise<TimeEntryT[]> {
  try {
    const rows = await prisma.timeEntry.findMany({ orderBy: { at: "asc" } });
    return rows.map((r) => ({ staffId: r.staffId, area: r.area, minutes: r.minutes, at: r.at.toISOString() }));
  } catch {
    return [];
  }
}

export async function loadStaffStates(): Promise<Map<string, StaffActiveState>> {
  const m = new Map<string, StaffActiveState>();
  const model = loadModel();
  // Base state from the packet (active_from), overlaid by StaffState rows.
  for (const s of model.staff) {
    const af = (s as unknown as { active_from?: string }).active_from ?? null;
    m.set(s.id, { staffId: s.id, active: true, activeFrom: af, deactivatedAt: null });
  }
  try {
    const rows = await prisma.staffState.findMany();
    for (const r of rows) {
      const base = m.get(r.staffId);
      m.set(r.staffId, {
        staffId: r.staffId,
        active: r.active,
        activeFrom: base?.activeFrom ?? null,
        deactivatedAt: r.deactivatedAt ? r.deactivatedAt.toISOString() : null,
      });
    }
  } catch {
    /* ignore */
  }
  return m;
}

export async function loadViewLogs() {
  try {
    return await prisma.viewLog.findMany({ orderBy: { at: "desc" } });
  } catch {
    return [];
  }
}

/** Open items a staff member still holds (must be reassigned before deactivation). */
export async function openItemsFor(staffId: string) {
  try {
    const [assignments, notes, questions] = await Promise.all([
      prisma.assignment.findMany({ where: { staffId, active: true } }),
      prisma.reviewNote.findMany({ where: { assigneeId: staffId, status: "open" } }),
      prisma.question.findMany({ where: { toId: staffId, status: "open" } }),
    ]);
    return [
      ...assignments.map((a) => ({ kind: "assignment", id: a.id, scope: `${a.scopeKind}:${a.scopeId}` })),
      ...notes.map((n) => ({ kind: "review_note", id: n.id })),
      ...questions.map((q) => ({ kind: "question", id: q.id })),
    ];
  } catch {
    return [];
  }
}
