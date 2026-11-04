import "server-only";
import { prisma } from "../db";

// Gap 1: Workspace isolation for evaluators.
// Two pre-seeded workspaces:
//   ws-clean  — "As delivered (clean)": packet data only, no manually-created workpaper items.
//   ws-main   — "Worked file (seeded season)": the full worked file.
// Fork: copies all C-layer rows from a source workspace to a new one. Each workspace
// has its own event hash chain. A write in one workspace never shows in another.
// Workspaces are never deleted; archiving sets archivedAt.

export interface WorkspaceSummary {
  id: string;
  name: string;
  label: string;
  kind: string;
  forkedFrom: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  createdBy: string | null;
}

export async function listWorkspaces(): Promise<WorkspaceSummary[]> {
  return prisma.workspace.findMany({ orderBy: { createdAt: "asc" } });
}

export async function getWorkspace(id: string): Promise<WorkspaceSummary | null> {
  return prisma.workspace.findUnique({ where: { id } });
}

export async function archiveWorkspace(id: string): Promise<void> {
  if (id === "ws-main" || id === "ws-clean") throw new Error("Cannot archive a system workspace.");
  await prisma.workspace.update({ where: { id }, data: { archivedAt: new Date() } });
}

// Tables to copy on fork, in dependency order (parent before child where FK exists).
// All tables that evaluators write to — the full C-layer list.
const FORK_TABLES = [
  "Verification",
  "DocumentLink",
  "PageLink",
  "Disposition",
  "CheckRun",
  "CheckResult",
  "Attachment",
  "AttachmentLink",
  "Issue",
  "Adjustment",
  "FactCorrection",
  "Batch",
  "Snapshot",
  "Scenario",
  "UserCursor",
  "Decision",
  "DueDiligence",
  "ExpectedDocument",
  "AreaReview",
  "OutsideFiling",
  "Question",
  "ReviewNote",
  "SignOff",
  "Assignment",
  "Notification",
  "TimeEntry",
  "ViewLog",
  "SoftLock",
  "FilingStatus",
  "Submission",
  "Extension",
  "AmendmentCase",
  "Notice",
  "ReplayConflict",
  "Event",
] as const;

// Map model name → Prisma client delegate accessor key (camelCase).
const MODEL_KEY: Record<string, string> = {
  Verification: "verification",
  DocumentLink: "documentLink",
  PageLink: "pageLink",
  Disposition: "disposition",
  CheckRun: "checkRun",
  CheckResult: "checkResult",
  Attachment: "attachment",
  AttachmentLink: "attachmentLink",
  Issue: "issue",
  Adjustment: "adjustment",
  FactCorrection: "factCorrection",
  Batch: "batch",
  Snapshot: "snapshot",
  Scenario: "scenario",
  UserCursor: "userCursor",
  Decision: "decision",
  DueDiligence: "dueDiligence",
  ExpectedDocument: "expectedDocument",
  AreaReview: "areaReview",
  OutsideFiling: "outsideFiling",
  Question: "question",
  ReviewNote: "reviewNote",
  SignOff: "signOff",
  Assignment: "assignment",
  Notification: "notification",
  TimeEntry: "timeEntry",
  ViewLog: "viewLog",
  SoftLock: "softLock",
  FilingStatus: "filingStatus",
  Submission: "submission",
  Extension: "extension",
  AmendmentCase: "amendmentCase",
  Notice: "notice",
  ReplayConflict: "replayConflict",
  Event: "event",
};

type PrismaDelegate = {
  findMany: (args: { where: { workspaceId: string } }) => Promise<Record<string, unknown>[]>;
  createMany: (args: { data: Record<string, unknown>[]; skipDuplicates?: boolean }) => Promise<unknown>;
};

/**
 * Fork a workspace: create a new Workspace record and copy all C-layer rows
 * from sourceId to it. The forked workspace starts with its own event chain
 * seeded from the copied events (hashes remain intact; new events extend the chain).
 */
export async function forkWorkspace(
  sourceId: string,
  name: string,
  actorId: string,
): Promise<WorkspaceSummary> {
  const newWs = await prisma.workspace.create({
    data: {
      name,
      label: `Forked from ${sourceId}`,
      kind: "fork",
      forkedFrom: sourceId,
      createdBy: actorId,
    },
  });

  for (const model of FORK_TABLES) {
    const key = MODEL_KEY[model] as keyof typeof prisma;
    const delegate = prisma[key] as unknown as PrismaDelegate;
    if (!delegate?.findMany || !delegate?.createMany) continue;

    const rows = await delegate.findMany({ where: { workspaceId: sourceId } });
    if (rows.length === 0) continue;

    const remapped = rows.map((row) => ({ ...row, workspaceId: newWs.id }));
    await delegate.createMany({ data: remapped, skipDuplicates: true });
  }

  return newWs;
}

/** Seed the two system workspaces. Called from importPacket on first import. */
export async function seedSystemWorkspaces(): Promise<void> {
  await prisma.workspace.upsert({
    where: { id: "ws-clean" },
    create: { id: "ws-clean", name: "As delivered (clean)", label: "Packet data only — no prior work", kind: "clean" },
    update: {},
  });
  await prisma.workspace.upsert({
    where: { id: "ws-main" },
    create: { id: "ws-main", name: "Worked file (seeded season)", label: "Full worked file with all seeded data", kind: "worked" },
    update: {},
  });
}
