import { loadModel } from "@/lib/packet/load";
import { getSession } from "@/lib/session";
import { currentVersion, computeDispositions, dispositionSummary } from "@/lib/evidence/disposition";
import { runChecks } from "@/lib/checks/runner";
import { groupIssues } from "@/lib/issues/group";
import { loadAdjustments } from "@/lib/change/store";
import { loadDecisions, loadAreaReviews } from "@/lib/judgment/store";
import { deriveExpectedDocuments } from "@/lib/judgment/expectedDocs";
import { deriveOutsideFilings, outsideFilingsResolved } from "@/lib/judgment/outsideFilings";
import { completenessAreas, areaOfIssue, computeAreaReadiness, computeGate } from "@/lib/judgment/completeness";
import { SectionTitle, Stat } from "@/components/ui";
import { attestArea } from "@/app/judgment-actions";

export default async function CompletenessPage() {
  const model = loadModel();
  const session = await getSession();
  const versionId = currentVersion(model, session.asOf)?.version ?? "v3";

  const issues = groupIssues(model, runChecks({ model, versionId }), versionId);
  const adjustments = await loadAdjustments();
  const decisions = await loadDecisions();
  const areaReviews = await loadAreaReviews();
  const dispositions = computeDispositions(model, session.asOf);
  const dsum = dispositionSummary(dispositions);
  const expected = deriveExpectedDocuments(model);
  const outside = deriveOutsideFilings(model);

  const approvedAdjIssues = new Set(adjustments.filter((a) => a.status === "approved").map((a) => a.issueId));
  const approvedDecIssues = new Set(decisions.filter((d) => d.status === "approved").map((d) => d.issueId));
  const isResolved = (issueId: string) => approvedAdjIssues.has(issueId) || approvedDecIssues.has(issueId);

  const attestByArea = new Map(areaReviews.map((r) => [r.area, r.attestedBy]));

  const areas = completenessAreas(model).map((area) => {
    const openIssues = issues.filter(
      (i) => areaOfIssue(i) === area && (i.kind === "return_error" || i.kind === "extraction_error" || i.kind === "judgment") && !isResolved(i.id),
    ).length;
    return computeAreaReadiness({ area, openIssues, pendingDecisions: 0, undisposedDocs: 0, attestedBy: attestByArea.get(area) ?? null });
  });

  // Identity issue is a hard blocker for 8867 and filing.
  const identityOpen = issues.filter((i) => i.area === "Identity" && !isResolved(i.id)).map((i) => i.id);

  const gate = computeGate({
    expectedDocs: expected,
    areas,
    dueDiligenceComplete: false, // no signed 8867 yet (seeded in Feature 4 workflow)
    openBlockingIssues: identityOpen,
    outsideFilingsResolved: outsideFilingsResolved(outside),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Completeness</h1>
        <span className={`chip ${gate.green ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
          gate: {gate.green ? "GREEN — ready" : "RED — not ready"}
        </span>
      </div>

      {!gate.green ? (
        <div className="card border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <div className="font-semibold">Blockers ({gate.blockers.length})</div>
          <ul className="mt-1 list-disc pl-5">{gate.blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>
        </div>
      ) : null}

      <section>
        <SectionTitle>1. Documents</SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat label="Dispositions" value={`${dsum.accounted}/${dsum.total}`} sub="Block 1" />
          <Stat label="Expected matched" value={`${expected.filter((d) => d.status !== "expected").length}/${expected.length}`} />
          <Stat label="Still expected" value={expected.filter((d) => d.status === "expected").length} />
        </div>
        <ul className="mt-2 space-y-1 text-sm">
          {expected.map((d) => (
            <li key={d.id} className="card p-2">
              <span className={`chip ${d.status === "matched" ? "bg-emerald-100 text-emerald-800" : d.status === "explained" ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-800"}`}>{d.status}</span>{" "}
              {d.description} {d.matchedDocumentId ? <span className="mono text-slate-400">→ {d.matchedDocumentId}</span> : null}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <SectionTitle>2. Areas (readiness computed, then attested)</SectionTitle>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr><th className="px-3 py-2">Area</th><th className="px-3 py-2">Open issues</th><th className="px-3 py-2">Readiness</th><th className="px-3 py-2">Attested</th><th className="px-3 py-2">Attest</th></tr>
            </thead>
            <tbody>
              {areas.map((a) => (
                <tr key={a.area} className="border-t border-slate-100">
                  <td className="px-3 py-2">{a.area.replace(/_/g, " ")}</td>
                  <td className="px-3 py-2">{a.openIssues}</td>
                  <td className="px-3 py-2"><span className={`chip ${a.computed === "green" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>{a.computed}</span></td>
                  <td className="px-3 py-2">{a.attestedBy ?? "—"}</td>
                  <td className="px-3 py-2">
                    <form action={attestArea} className="flex items-center gap-1">
                      <input type="hidden" name="area" value={a.area} />
                      <input type="hidden" name="readiness" value={a.computed} />
                      {a.computed !== "green" ? <input name="reason" placeholder="override reason" className="w-32 rounded border border-slate-300 px-1 py-0.5 text-xs" /> : null}
                      <button className="rounded border border-slate-300 px-2 py-0.5 text-xs">attest</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionTitle>3. Outside filings</SectionTitle>
        <ul className="space-y-1 text-sm">
          {outside.map((o) => (
            <li key={o.id} className="card p-2">
              <span className="chip bg-slate-100 text-slate-600">{o.status.replace(/_/g, " ")}</span> {o.filing}{" "}
              <span className="text-slate-500">— {o.whoFiles}{o.inEngagement ? " (in engagement)" : ""}</span>
              <div className="text-xs text-slate-400">{o.basis}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
