import "server-only";
import { prisma } from "./db";
import { loadModel } from "./packet/load";
import { runChecks } from "./checks/runner";
import { groupIssues, returnAffecting } from "./issues/group";
import type { BadgeCounts } from "./nav";
import type { Actor } from "./people/permissions";

// Open-work counts for the nav badges. Computed server-side, DB-tolerant. A
// client only ever receives its own open-question count (see filterNav).

export async function loadBadgeCounts(actor: Actor): Promise<BadgeCounts> {
  const model = loadModel();

  // Issues: return-affecting, derived from the checks (no DB needed).
  let issues = 0;
  try {
    const findings = runChecks({ model, versionId: "v3" });
    issues = returnAffecting(groupIssues(model, findings, "v3")).length;
  } catch {
    /* ignore */
  }

  const counts: BadgeCounts = { issues };

  // DB-backed counts degrade to undefined when there is no database.
  try {
    const [review, questions, changes, decisions] = await Promise.all([
      prisma.reviewNote.count({ where: { status: "open" } }),
      actor.role === "client"
        ? prisma.question.count({ where: { status: "open", toId: actor.id } })
        : prisma.question.count({ where: { status: "open" } }),
      prisma.adjustment.count({ where: { status: "proposed" } }),
      prisma.decision.count({ where: { status: { in: ["draft", "proposed", "reviewed"] } } }),
    ]);
    counts.review = review || undefined;
    counts.questions = questions || undefined;
    counts.changes = changes || undefined;
    counts.decisions = decisions || undefined;
  } catch {
    /* no DB — only the checks-derived issue count is shown */
  }

  return counts;
}
