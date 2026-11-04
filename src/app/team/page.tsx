import { loadModel } from "@/lib/packet/load";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { deadlineStatus, formatFirmLocal, type DeadlineT } from "@/lib/people/deadlines";
import { SectionTitle, Stat } from "@/components/ui";
import { logTime } from "@/app/people-actions";

const STATUS_STYLE: Record<string, string> = {
  met: "bg-emerald-100 text-emerald-800",
  overdue: "bg-red-100 text-red-800",
  due_soon: "bg-amber-100 text-amber-800",
  upcoming: "bg-slate-100 text-slate-600",
};

export default async function TeamPage() {
  const model = loadModel();
  const session = await getSession();
  const now = session.asOf;

  const assign = (model.raw.firm as Record<string, unknown>).assignment_at_start as Record<string, string>;
  const deadlines = ((model.raw.firm as Record<string, unknown>).deadlines ?? []) as Array<{ what: string; date: string }>;
  const budget = ((model.raw.firm as Record<string, unknown>).budget_hours ?? {}) as Record<string, number>;

  let times: Array<{ area: string; minutes: number }> = [];
  let dbAssignments: Array<{ staffId: string; role: string; scopeId: string }> = [];
  try {
    times = await prisma.timeEntry.findMany({ where: { workspaceId: session.workspaceId }, select: { area: true, minutes: true } });
    dbAssignments = await prisma.assignment.findMany({ where: { active: true, workspaceId: session.workspaceId }, select: { staffId: true, role: true, scopeId: true } });
  } catch {
    /* ignore */
  }
  const actualByArea = new Map<string, number>();
  for (const t of times) actualByArea.set(t.area, (actualByArea.get(t.area) ?? 0) + t.minutes);

  const deadlineRows: DeadlineT[] = deadlines.map((d) => ({ what: d.what, dateUtc: new Date(d.date).toISOString() }));

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Team</h1>

      <SectionTitle>Assignments</SectionTitle>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {Object.entries(assign).map(([role, id]) => (
          <Stat key={role} label={role} value={id} sub={model.staffById.get(id)?.role} />
        ))}
      </div>
      {dbAssignments.length ? (
        <p className="text-xs text-slate-500">Reassignments: {dbAssignments.map((a) => `${a.role}→${a.staffId}`).join(", ")}</p>
      ) : null}

      <SectionTitle>Deadlines (firm-local, America/Chicago; as of {now.slice(0, 10)})</SectionTitle>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">What</th><th className="px-3 py-2">Due (local)</th><th className="px-3 py-2">Status</th></tr>
          </thead>
          <tbody>
            {deadlineRows.map((d) => {
              const st = deadlineStatus(d, now);
              return (
                <tr key={d.what} className="border-t border-slate-100">
                  <td className="px-3 py-2">{d.what}</td>
                  <td className="px-3 py-2 mono">{formatFirmLocal(d.dateUtc)}</td>
                  <td className="px-3 py-2"><span className={`chip ${STATUS_STYLE[st]}`}>{st.replace("_", " ")}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <SectionTitle>Time vs budget</SectionTitle>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">Area</th><th className="px-3 py-2">Budget (h)</th><th className="px-3 py-2">Actual (h)</th><th className="px-3 py-2">Used</th></tr>
          </thead>
          <tbody>
            {Object.entries(budget).map(([area, hrs]) => {
              const actualH = (actualByArea.get(area) ?? 0) / 60;
              const pct = hrs > 0 ? (actualH / hrs) * 100 : 0;
              return (
                <tr key={area} className="border-t border-slate-100">
                  <td className="px-3 py-2">{area.replace(/_/g, " ")}</td>
                  <td className="px-3 py-2 mono">{hrs}</td>
                  <td className="px-3 py-2 mono">{actualH.toFixed(1)}</td>
                  <td className="px-3 py-2"><span className={`chip ${pct > 100 ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-600"}`}>{pct.toFixed(0)}%</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form action={logTime} className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col">Area
          <select name="area" className="rounded border border-slate-300 px-2 py-1">
            {Object.keys(budget).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="flex flex-col">Minutes<input name="minutes" type="number" className="w-24 rounded border border-slate-300 px-2 py-1" /></label>
        <label className="flex flex-col">Note<input name="note" className="rounded border border-slate-300 px-2 py-1" /></label>
        <button className="rounded bg-slate-900 px-3 py-1 text-white">Log time</button>
      </form>
    </div>
  );
}
