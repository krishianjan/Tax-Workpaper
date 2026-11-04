import { getSession } from "@/lib/session";
import { listWorkspaces, forkWorkspace, archiveWorkspace } from "@/lib/firm/workspace";
import { SectionTitle } from "@/components/ui";
import { revalidatePath } from "next/cache";

// Server actions (defined here, colocated — no separate file needed).
async function forkAction(formData: FormData) {
  "use server";
  const session = await getSession();
  const sourceId = String(formData.get("sourceId") ?? "ws-main");
  const name = String(formData.get("name") ?? "").trim() || `Fork of ${sourceId}`;
  await forkWorkspace(sourceId, name, session.staff.id);
  revalidatePath("/workspaces");
}

async function archiveAction(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  await archiveWorkspace(id);
  revalidatePath("/workspaces");
}

export default async function WorkspacesPage() {
  const session = await getSession();
  let workspaces: Awaited<ReturnType<typeof listWorkspaces>> = [];
  try { workspaces = await listWorkspaces(); } catch { /* DB not ready */ }

  const active = workspaces.filter((w) => !w.archivedAt);
  const archived = workspaces.filter((w) => w.archivedAt);

  const KIND_BADGE: Record<string, string> = {
    clean: "bg-sky-100 text-sky-800",
    worked: "bg-emerald-100 text-emerald-800",
    fork: "bg-violet-100 text-violet-800",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Workspaces</h1>
        <p className="mt-1 text-sm text-slate-500">
          Each evaluator should fork their own copy. A fork copies the entire workpaper state; writes in one workspace never
          appear in another. Workspaces are never deleted — archive when done. Current workspace:{" "}
          <span className="mono font-semibold">{session.workspaceId}</span>.
        </p>
      </div>

      <SectionTitle>Active workspaces ({active.length})</SectionTitle>
      <div className="space-y-2">
        {active.length === 0 && <p className="text-sm text-slate-500">No workspaces yet — import the packet to seed ws-clean and ws-main.</p>}
        {active.map((w) => (
          <div key={w.id} className={`card flex flex-wrap items-start justify-between gap-3 p-3 ${w.id === session.workspaceId ? "border-sky-300" : ""}`}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">{w.name}</span>
                <span className={`chip ${KIND_BADGE[w.kind] ?? "bg-slate-100 text-slate-700"}`}>{w.kind}</span>
                {w.id === session.workspaceId && <span className="chip bg-sky-700 text-white">current</span>}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                id: <span className="mono">{w.id}</span>
                {w.forkedFrom ? <> · forked from <span className="mono">{w.forkedFrom}</span></> : null}
                {w.label ? <> · {w.label}</> : null}
                {w.createdBy ? <> · by {w.createdBy}</> : null}
                {" · "}{w.createdAt.toISOString().slice(0, 10)}
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {w.kind !== "clean" && w.id !== "ws-main" && (
                <form action={archiveAction}>
                  <input type="hidden" name="id" value={w.id} />
                  <button className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50">Archive</button>
                </form>
              )}
            </div>
          </div>
        ))}
      </div>

      <SectionTitle>Fork a workspace</SectionTitle>
      <div className="card p-4">
        <p className="mb-3 text-sm text-slate-600">
          Forking copies all workpaper state from the source workspace. Use <strong>ws-main</strong> (Worked file) to start
          with the full seeded season; use <strong>ws-clean</strong> (As delivered) to start fresh.
        </p>
        <form action={forkAction} className="flex flex-wrap items-end gap-3 text-sm">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Source workspace</label>
            <select name="sourceId" className="rounded border border-slate-300 px-2 py-1">
              {active.map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({w.id})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">New workspace name</label>
            <input
              name="name"
              placeholder={`Evaluator fork — ${new Date().toISOString().slice(0, 10)}`}
              className="w-64 rounded border border-slate-300 px-2 py-1"
            />
          </div>
          <button className="rounded bg-sky-700 px-3 py-1 text-white hover:bg-sky-800">Fork</button>
        </form>
      </div>

      {archived.length > 0 && (
        <>
          <SectionTitle>Archived ({archived.length})</SectionTitle>
          <div className="space-y-1">
            {archived.map((w) => (
              <div key={w.id} className="card p-2 text-xs text-slate-500">
                <span className="mono">{w.id}</span> — {w.name} · archived {w.archivedAt!.toISOString().slice(0, 10)}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
