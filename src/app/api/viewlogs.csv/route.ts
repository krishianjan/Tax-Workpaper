import { prisma } from "@/lib/db";
import { emitEvent } from "@/lib/event";
import { getSession } from "@/lib/session";

// 7.2 View-log CSV export (admin or partner). The export itself appends an
// Event — exporting the access log is an auditable action. Filters: ?actor=,
// ?field=. Only roles that may see the internal log get data.

export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  const session = await getSession();
  const role = session.staff.role;
  if (role !== "firm_administrator" && role !== "partner") {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const actor = url.searchParams.get("actor");
  const field = url.searchParams.get("field");

  try {
    const ws = session.workspaceId;
    const rows = await prisma.viewLog.findMany({
      where: { workspaceId: ws, ...(actor ? { actorId: actor } : {}), ...(field ? { field } : {}) },
      orderBy: { at: "desc" },
    });

    await prisma.$transaction(async (tx) => {
      await emitEvent(tx, {
        workspaceId: ws,
        actorId: session.staff.id,
        type: "viewlog.exported",
        entityKind: "view_log",
        entityId: "csv",
        payload: { count: rows.length, actor: actor ?? null, field: field ?? null },
      });
    });

    const header = ["at", "actorId", "field", "entityId", "reason"].join(",");
    const body = rows
      .map((r) => [r.at.toISOString(), r.actorId, r.field, r.entityId, r.reason ?? ""].map(csvCell).join(","))
      .join("\n");
    return new Response(`${header}\n${body}\n`, {
      headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="view-logs.csv"' },
    });
  } catch {
    return new Response("at,actorId,field,entityId,reason\n", { headers: { "content-type": "text/csv" } });
  }
}
