import { getSession } from "@/lib/session";
import { SectionTitle, Stat } from "@/components/ui";
import { loadActiveStandard, loadStandardHistory } from "@/lib/firm/store";
import { editStandard } from "@/app/firm-actions";

export default async function StandardsPage() {
  const session = await getSession();
  const isAdmin = session.staff.role === "firm_administrator";
  const active = await loadActiveStandard();
  const history = await loadStandardHistory();

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Firm standards</h1>
      <p className="text-sm text-slate-500">
        Versioned. Every Decision, Adjustment and sign-off records the version it was evaluated under; re-evaluating under a new
        version is explicit and never silently re-grades a past approval. Only the firm administrator may edit, and edits are
        blocked for frozen engagements.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Stat label="Active version" value={`v${active.version}`} sub={active.note ?? ""} />
        <Stat label="Partner threshold" value={`$${active.partnerThreshold.toLocaleString()}`} />
        <Stat label="Retention" value={`${active.retentionYears} yrs`} />
        <Stat label="Confidence floor" value={active.confidenceThreshold} />
      </div>

      <SectionTitle>Rules</SectionTitle>
      <ul className="card space-y-1 p-3 text-sm">
        {active.rules.map((r, i) => <li key={i} className="border-b border-slate-100 pb-1 last:border-0">{r}</li>)}
      </ul>

      <SectionTitle>Required steps ({active.requiredSteps.length})</SectionTitle>
      <ol className="card list-decimal space-y-1 p-3 pl-7 text-sm">
        {active.requiredSteps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>

      <SectionTitle>Edit (creates a new version)</SectionTitle>
      {isAdmin ? (
        <form action={editStandard} className="card flex flex-wrap items-end gap-3 p-3 text-sm">
          <label className="flex flex-col">Partner threshold ($)
            <input name="partnerThreshold" type="number" defaultValue={active.partnerThreshold} className="w-32 rounded border border-slate-300 px-2 py-1" />
          </label>
          <label className="flex flex-col">Retention (yrs)
            <input name="retentionYears" type="number" defaultValue={active.retentionYears} className="w-24 rounded border border-slate-300 px-2 py-1" />
          </label>
          <label className="flex flex-col">Confidence floor
            <input name="confidenceThreshold" type="number" step="0.01" defaultValue={active.confidenceThreshold} className="w-24 rounded border border-slate-300 px-2 py-1" />
          </label>
          <label className="flex flex-col">Re-sign policy
            <select name="resignOn" defaultValue={active.resignOn} className="rounded border border-slate-300 px-2 py-1">
              <option value="amounts">amounts</option>
              <option value="amounts_and_identity">amounts_and_identity</option>
            </select>
          </label>
          <label className="flex flex-col">Note
            <input name="note" className="rounded border border-slate-300 px-2 py-1" />
          </label>
          <button className="rounded bg-slate-900 px-3 py-1 text-white">Save new version</button>
        </form>
      ) : (
        <p className="card p-3 text-sm text-slate-500">Only the firm administrator (st-05) may edit standards. Switch role to edit.</p>
      )}

      <SectionTitle>Version history</SectionTitle>
      {history.length === 0 ? (
        <p className="text-sm text-slate-500">Only the seeded standard (v0) is active; no admin edits yet.</p>
      ) : (
        <table className="card w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">Version</th><th className="px-3 py-2">By</th><th className="px-3 py-2">Threshold</th><th className="px-3 py-2">Note</th></tr>
          </thead>
          <tbody>
            {history.map((v) => (
              <tr key={v.version} className="border-t border-slate-100">
                <td className="px-3 py-2 mono">v{v.version}</td>
                <td className="px-3 py-2">{v.createdBy ?? "—"}</td>
                <td className="px-3 py-2 mono">${v.partnerThreshold.toLocaleString()}</td>
                <td className="px-3 py-2">{v.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
