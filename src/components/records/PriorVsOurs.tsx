import Link from "next/link";
import { RecordShell } from "./RecordShell";
import type { RecordCtx } from "@/lib/records/ctx";

interface MethodChange {
  area: string;
  prior: string;
  ours: string;
  why: string;
  evidence: string;
  effect: string;
}

const CHANGES: MethodChange[] = [
  { area: "Home office", prior: "300 sq ft (simplified)", ours: "240 sq ft", why: "Client confirmed 2 rooms = 240 sq ft; prior figure unconfirmed.", evidence: "call-01", effect: "small" },
  { area: "Mileage", prior: "Standard mileage, 11,800 mi", ours: "8,100 mi", why: "Page 3 of the log duplicates page 2 (DUPLICATE_PAGE).", evidence: "D23", effect: "+919.45 fed" },
  { area: "HVAC (rental A)", prior: "Repair (deducted 11,000)", ours: "Decision: repair vs improvement", why: "Building-system HVAC may be a capital improvement (§1.263(a)-3).", evidence: "D47 / SchE.14A", effect: "judgment" },
  { area: "S-corp stock basis", prior: "Assumed sufficient (2022 worksheet)", ours: "Basis gap — 2023/2024 null", why: "2023 K-1 never obtained; D40 late K-1 rewrites the assumption.", evidence: "D40", effect: "scope" },
  { area: "Backdoor Roth basis", prior: "7,000 basis per client", ours: "Decision (questionnaire conflict)", why: "Questionnaire said no basis; 5498 not obtained.", evidence: "D42", effect: "+taxable 26" },
];

export function PriorVsOurs({ model, meta }: RecordCtx) {
  const wp = (model.raw.prior_years as Record<string, unknown>).prior_preparer_workpaper as Record<string, unknown>;
  const notes = (wp.notes ?? []) as string[];
  const openItems = (wp.open_items_left_by_prior_preparer ?? []) as string[];

  return (
    <RecordShell title="17. Prior preparer vs what we changed" slug="prior-vs-ours" meta={meta}>
      <div className="card p-3 text-sm">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Prior preparer memo (D07)</div>
        <p className="text-slate-600">{String(wp.summary_memo ?? "")}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="card p-3 text-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Prior notes</div>
          <ul className="list-disc space-y-1 pl-5 text-slate-600">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
        <div className="card p-3 text-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Open items left (→ our Issues / Decisions)</div>
          <ul className="list-disc space-y-1 pl-5 text-slate-600">{openItems.map((n, i) => <li key={i}>{n}</li>)}</ul>
          <p className="mt-2 text-xs">Tracked on <Link href="/issues">Issues</Link> and <Link href="/decisions">Decisions</Link>.</p>
        </div>
      </div>

      <div className="card scroll-box">
        <div className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Method changes year over year</div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">Area</th><th className="px-3 py-2">Prior</th><th className="px-3 py-2">Ours</th><th className="px-3 py-2">Why</th><th className="px-3 py-2">Evidence</th><th className="px-3 py-2">Effect</th></tr>
          </thead>
          <tbody>
            {CHANGES.map((c) => (
              <tr key={c.area} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2 font-medium">{c.area}</td>
                <td className="px-3 py-2 text-xs">{c.prior}</td>
                <td className="px-3 py-2 text-xs">{c.ours}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{c.why}</td>
                <td className="px-3 py-2 mono text-xs">{c.evidence}</td>
                <td className="px-3 py-2 text-xs">{c.effect}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </RecordShell>
  );
}
