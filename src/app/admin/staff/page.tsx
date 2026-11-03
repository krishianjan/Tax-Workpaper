import { loadModel } from "@/lib/packet/load";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { SectionTitle } from "@/components/ui";
import { loadStaffStates, openItemsFor } from "@/lib/firm/store";
import { isActiveAt } from "@/lib/firm/staffLifecycle";
import { deactivateStaff, changeClearance } from "@/app/firm-actions";

export default async function StaffAdminPage() {
  const model = loadModel();
  const session = await getSession();
  const isAdmin = session.staff.role === "firm_administrator";
  const now = session.asOf;

  const states = await loadStaffStates();
  const openCounts = new Map<string, number>();
  for (const s of model.staff) openCounts.set(s.id, (await openItemsFor(s.id)).length);

  let clearanceLog: Array<{ id: string; actorId: string | null; entityId: string; payload: unknown; at: Date }> = [];
  try {
    clearanceLog = await prisma.event.findMany({ where: { type: "staff.clearance_changed" }, orderBy: { seq: "desc" }, take: 20 });
  } catch {
    /* ignore */
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Staff administration</h1>
      <p className="text-sm text-slate-500">
        Deactivation revokes active assignments and is blocked until the staff member’s open items are reassigned.{" "}
        <span className="mono">active_from</span> is enforced at command time; clearance changes are logged.
      </p>

      <SectionTitle>Staff (as of {now.slice(0, 10)})</SectionTitle>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Staff</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Active from</th>
              <th className="px-3 py-2">Clearance</th><th className="px-3 py-2">Active now</th><th className="px-3 py-2">Open items</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {model.staff.map((s) => {
              const st = states.get(s.id)!;
              const active = isActiveAt(st, now);
              const open = openCounts.get(s.id) ?? 0;
              return (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{s.id} · {(s as { name?: string }).name ?? ""}</td>
                  <td className="px-3 py-2">{s.role}</td>
                  <td className="px-3 py-2 mono">{st.activeFrom ?? "—"}</td>
                  <td className="px-3 py-2">{s.sensitive_data_clearance ? <span className="chip bg-emerald-100 text-emerald-800">cleared</span> : <span className="chip bg-amber-100 text-amber-800">masked</span>}</td>
                  <td className="px-3 py-2">{active ? "✓" : <span className="text-slate-400">·</span>}</td>
                  <td className="px-3 py-2">{open > 0 ? <span className="text-red-700">{open}</span> : 0}</td>
                  <td className="px-3 py-2">
                    {isAdmin ? (
                      <div className="flex flex-wrap gap-2">
                        <form action={changeClearance}>
                          <input type="hidden" name="staffId" value={s.id} />
                          <input type="hidden" name="clearance" value={s.sensitive_data_clearance ? "false" : "true"} />
                          <button className="rounded border border-slate-300 px-2 py-0.5 text-xs">{s.sensitive_data_clearance ? "Revoke clearance" : "Grant clearance"}</button>
                        </form>
                        <form action={deactivateStaff}>
                          <input type="hidden" name="staffId" value={s.id} />
                          <button className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-700" title={open > 0 ? `Blocked: ${open} open items` : ""}>Deactivate</button>
                        </form>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">admin only</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <SectionTitle>Clearance change log</SectionTitle>
      <ul className="space-y-1 text-sm">
        {clearanceLog.length === 0 ? <li className="text-slate-500">No clearance changes recorded.</li> : null}
        {clearanceLog.map((e) => (
          <li key={e.id} className="card p-2 text-xs">
            <span className="mono">{e.actorId}</span> changed clearance for <span className="mono">{e.entityId}</span>{" "}
            {JSON.stringify(e.payload)} <span className="text-slate-400">{e.at.toISOString().slice(0, 16).replace("T", " ")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
