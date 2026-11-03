import { loadModel } from "@/lib/packet/load";
import { prisma } from "@/lib/db";
import { can, type Actor, type Action, type Role } from "@/lib/people/permissions";
import { SectionTitle } from "@/components/ui";

const ACTIONS: Action[] = [
  "content.create", "content.review", "content.approve", "signoff.reviewer", "signoff.partner",
  "filing.release", "reviewnote.clear", "question.ask", "client.approve", "form8879.sign",
  "staff.manage", "unmask", "view.internal",
];

export default async function AccessPage() {
  const model = loadModel();
  const now = new Date().toISOString();
  const staff: Actor[] = model.staff.map((s) => ({
    id: s.id,
    role: s.role as Role,
    clearance: s.sensitive_data_clearance === true,
    activeFrom: (s as unknown as { active_from?: string }).active_from ?? "2000-01-01",
  }));
  const client: Actor = { id: "cu-01", role: "client", clearance: false, activeFrom: "2000-01-01" };
  const actors = [...staff, client];

  let viewLogs: Array<{ id: string; actorId: string; field: string; entityId: string; at: Date }> = [];
  try {
    viewLogs = await prisma.viewLog.findMany({ orderBy: { at: "desc" }, take: 20 });
  } catch {
    /* ignore */
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Access control</h1>
      <p className="text-sm text-slate-500">
        This matrix is computed from the same <span className="mono">can()</span> the commands call — the UI cannot show an
        action it would not enforce. Independence (item-level self-review) and <span className="mono">active_from</span> also
        gate at command time.
      </p>

      <SectionTitle>Permission matrix (now = {now.slice(0, 10)})</SectionTitle>
      <div className="card overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-left uppercase text-slate-500">
            <tr>
              <th className="px-2 py-2">Actor</th>
              {ACTIONS.map((a) => <th key={a} className="px-2 py-2">{a.replace(/\./g, " ")}</th>)}
            </tr>
          </thead>
          <tbody>
            {actors.map((actor) => (
              <tr key={actor.id} className="border-t border-slate-100">
                <td className="px-2 py-2 font-medium">
                  {actor.id} <span className="text-slate-400">{actor.role}{actor.clearance ? "" : " · masked"}</span>
                </td>
                {ACTIONS.map((a) => {
                  const d = can(actor, a, { kind: "x", preparedBy: "other" }, { now, ownEngagementClientIds: ["cu-01", "cu-02"] });
                  return (
                    <td key={a} className="px-2 py-2" title={d.reason}>
                      {d.allow ? <span className="text-emerald-700">✓</span> : <span className="text-slate-300">·</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle>View log ({viewLogs.length}) — every unmask is recorded</SectionTitle>
      <ul className="space-y-1 text-sm">
        {viewLogs.length === 0 ? <li className="text-slate-500">No unmask events yet.</li> : null}
        {viewLogs.map((v) => (
          <li key={v.id} className="card p-2">
            <span className="mono">{v.actorId}</span> viewed <span className="mono">{v.field}</span> on {v.entityId}{" "}
            <span className="text-xs text-slate-400">{v.at.toISOString().slice(0, 16).replace("T", " ")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
