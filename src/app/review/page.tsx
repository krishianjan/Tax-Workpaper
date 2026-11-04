import { prisma } from "@/lib/db";
import { loadModel } from "@/lib/packet/load";
import { openBlockingNotes, type ReviewNoteT } from "@/lib/people/reviewNotes";
import { SectionTitle, Stat } from "@/components/ui";
import { createReviewNote, transitionReviewNote, createSignOff, recomputeSignOffsAction } from "@/app/people-actions";

const NOTE_STYLE: Record<string, string> = { open: "bg-red-100 text-red-800", addressed: "bg-amber-100 text-amber-800", cleared: "bg-emerald-100 text-emerald-800" };
const SO_STYLE: Record<string, string> = { valid: "bg-emerald-100 text-emerald-800", reopened: "bg-amber-100 text-amber-800", superseded: "bg-slate-200 text-slate-700" };

export default async function ReviewPage() {
  const model = loadModel();
  const session = await (await import("@/lib/session")).getSession();
  const wsId = session.workspaceId;
  let notes: Array<{ id: string; authorId: string; assigneeId: string | null; targetKind: string; targetId: string; severity: string; status: string }> = [];
  let signoffs: Array<{ id: string; level: string; scope: string; status: string; signedBy: string; reopenReason: string | null }> = [];
  try {
    notes = await prisma.reviewNote.findMany({ where: { workspaceId: wsId }, orderBy: { createdAt: "desc" } });
    signoffs = await prisma.signOff.findMany({ where: { workspaceId: wsId }, orderBy: { signedAt: "asc" } });
  } catch {
    /* ignore */
  }
  const blocking = openBlockingNotes(notes as unknown as ReviewNoteT[]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Review</h1>
        <form action={recomputeSignOffsAction}>
          <button className="rounded border border-slate-300 px-3 py-1 text-sm">Recompute sign-offs</button>
        </form>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Open blocking notes" value={blocking.length} sub="block filing" />
        <Stat label="Sign-offs" value={signoffs.length} />
        <Stat label="Reopened" value={signoffs.filter((s) => s.status === "reopened").length} />
        <Stat label="Notes total" value={notes.length} />
      </div>

      <SectionTitle>Sign-offs</SectionTitle>
      <div className="space-y-2">
        {signoffs.map((s) => (
          <div key={s.id} className="card p-2 text-sm">
            <span className={`chip ${SO_STYLE[s.status]}`}>{s.status}</span>{" "}
            <span className="mono">{s.level} · {s.scope}</span> by {s.signedBy}
            {s.reopenReason ? <span className="ml-2 text-amber-700">{s.reopenReason}</span> : null}
          </div>
        ))}
      </div>
      <form action={createSignOff} className="flex flex-wrap items-end gap-2 text-sm">
        <select name="level" className="rounded border border-slate-300 px-2 py-1">
          {["preparer", "reviewer", "partner", "client", "quality"].map((l) => <option key={l}>{l}</option>)}
        </select>
        <select name="scope" className="rounded border border-slate-300 px-2 py-1">
          {["return", "form8879", "area", "issue", "decision"].map((s) => <option key={s}>{s}</option>)}
        </select>
        <input name="preparedBy" placeholder="preparedBy (independence)" className="rounded border border-slate-300 px-2 py-1" />
        <button className="rounded bg-slate-900 px-3 py-1 text-white">Sign off</button>
      </form>

      <SectionTitle>Review notes</SectionTitle>
      <div className="space-y-2">
        {notes.map((n) => (
          <div key={n.id} className="card p-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`chip ${NOTE_STYLE[n.status]}`}>{n.status}</span>
              <span className={`chip ${n.severity === "blocking" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>{n.severity}</span>
              <span className="text-slate-500">{n.targetKind}:{n.targetId}</span>
              <span className="text-xs text-slate-400">author {n.authorId} · assignee {n.assigneeId ?? "—"}</span>
            </div>
            <div className="mt-1 flex gap-2">
              {n.status === "open" ? (
                <form action={transitionReviewNote}><input type="hidden" name="id" value={n.id} /><input type="hidden" name="action" value="address" /><button className="rounded border border-slate-300 px-2 py-0.5 text-xs">address</button></form>
              ) : null}
              {n.status !== "cleared" ? (
                <form action={transitionReviewNote}><input type="hidden" name="id" value={n.id} /><input type="hidden" name="action" value="clear" /><button className="rounded border border-slate-300 px-2 py-0.5 text-xs">clear</button></form>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <form action={createReviewNote} className="flex flex-wrap items-end gap-2 text-sm">
        <select name="severity" className="rounded border border-slate-300 px-2 py-1"><option value="blocking">blocking</option><option value="non_blocking">non_blocking</option></select>
        <input name="targetKind" placeholder="target kind" defaultValue="issue" className="rounded border border-slate-300 px-2 py-1" />
        <input name="targetId" placeholder="target id" className="rounded border border-slate-300 px-2 py-1" />
        <select name="assigneeId" className="rounded border border-slate-300 px-2 py-1"><option value="">(unassigned)</option>{model.staff.map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}</select>
        <input name="text" placeholder="note text" className="flex-1 rounded border border-slate-300 px-2 py-1" />
        <button className="rounded bg-slate-900 px-3 py-1 text-white">Add note</button>
      </form>
    </div>
  );
}
