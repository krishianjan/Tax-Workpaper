import { RecordShell } from "./RecordShell";
import { NumberCell } from "./NumberCell";
import type { RecordCtx } from "@/lib/records/ctx";
import { line, lineValueCents } from "@/lib/checks/helpers";

export function Foreign({ model, versionId, meta }: RecordCtx) {
  const L = (k: string) => lineValueCents(line(model, versionId, k));
  const fx = (model.raw as unknown as { fx_rates?: { SEK_per_USD?: Record<string, number> } }).fx_rates?.SEK_per_USD ?? {};
  const sek = 18450;
  const usedUsd = Math.round(sek / (fx["2024_average"] ?? 10.56));
  const correctUsd = Math.round(sek / (fx["2025_average"] ?? 9.86));

  return (
    <RecordShell title="11. Foreign" slug="foreign" meta={meta}>
      <div className="card p-3 text-sm">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Sparbanken Norrland (D36) — interest</div>
        <p>
          SEK 18,450 interest. Engine used the <span className="mono">2024 average</span> rate {fx["2024_average"]} → USD{" "}
          <span className="mono">{usedUsd.toLocaleString()}</span> (SchB.1.6). The correct <span className="mono">2025 average</span>{" "}
          {fx["2025_average"]} → USD <span className="mono">{correctUsd.toLocaleString()}</span> (Δ +{(correctUsd - usedUsd).toLocaleString()}).
          Flagged by <span className="mono">FX_RATE_PERIOD</span>.
        </p>
      </div>

      <div className="card scroll-box">
        <div className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Form 8938 (uses the year-end rate — correct)</div>
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-t border-slate-100"><td className="px-3 py-2">Maximum value during year</td><td className="px-3 py-2 text-right"><NumberCell cents={L("F8938.1.max")} lineKey="F8938.1.max" /></td></tr>
            <tr className="border-t border-slate-100"><td className="px-3 py-2">Year-end value</td><td className="px-3 py-2 text-right"><NumberCell cents={L("F8938.1.ye")} lineKey="F8938.1.ye" /></td></tr>
            <tr className="border-t border-slate-100"><td className="px-3 py-2">Form 8938 required?</td><td className="px-3 py-2 text-right">{String(line(model, versionId, "F8938.req")?.value ?? "—")}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="card p-3 text-sm">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Other foreign matters</div>
        <ul className="space-y-1">
          <li><span className="chip bg-sky-100 text-sky-800">scope</span> FBAR (FinCEN 114): due 10/15, filed by the client separately — outside this engagement.</li>
          <li><span className="chip bg-amber-100 text-amber-800">open</span> Form 3520 (2023 foreign inheritance &gt; 100,000): prior preparer left it unresolved — a Decision/question.</li>
          <li>Foreign tax paid (D31 1099-DIV box 7): <span className="mono">186</span> → foreign tax credit (Schedule 3).</li>
        </ul>
      </div>
    </RecordShell>
  );
}
