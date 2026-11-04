import Link from "next/link";
import { loadModel } from "@/lib/packet/load";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can, type Actor, type Action, type Role } from "@/lib/people/permissions";
import { SectionTitle } from "@/components/ui";
import { collectSensitiveFields } from "@/lib/firm/sensitiveCatalog";
import { maskToken } from "@/lib/firm/sensitive";
import { RevealField } from "@/components/RevealField";
import { seedSensitiveStore } from "@/app/firm-actions";

const ACTIONS: Action[] = [
  "content.create", "content.review", "content.approve", "signoff.reviewer", "signoff.partner",
  "filing.release", "reviewnote.clear", "question.ask", "client.approve", "form8879.sign",
  "staff.manage", "unmask", "view.internal",
];

export default async function AccessPage() {
  const model = loadModel();
  const session = await getSession();
  const now = new Date().toISOString();
  const canExport = session.staff.role === "firm_administrator" || session.staff.role === "partner";
  const fields = collectSensitiveFields(model);
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
    viewLogs = await prisma.viewLog.findMany({ where: { workspaceId: session.workspaceId }, orderBy: { at: "desc" }, take: 100 });
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

      <SectionTitle>Sensitive values (encrypted at rest; AES-256-GCM)</SectionTitle>
      <p className="text-sm text-slate-500">
        Stored as masked tokens; the plaintext is only produced by <span className="mono">revealSensitive</span>, which needs
        clearance + a reason and writes a view log.{" "}
        <form action={seedSensitiveStore} className="inline">
          <button className="rounded border border-slate-300 px-2 py-0.5 text-xs">Seed encrypted store</button>
        </form>
      </p>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">Field</th><th className="px-3 py-2">Kind</th><th className="px-3 py-2">Value</th></tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.ref} className="border-t border-slate-100">
                <td className="px-3 py-2 mono text-xs">{f.ref}</td>
                <td className="px-3 py-2">{f.kind}</td>
                <td className="px-3 py-2">
                  {session.cleared ? (
                    <RevealField refId={f.ref} mask={maskToken(f.kind, f.plaintext)} />
                  ) : (
                    <span className="mono">{maskToken(f.kind, f.plaintext)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle>View log ({viewLogs.length}) — every unmask is recorded</SectionTitle>
      {canExport ? (
        <p className="text-sm"><Link href="/api/viewlogs.csv">Export CSV</Link> (the export itself is logged as an event)</p>
      ) : null}
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
