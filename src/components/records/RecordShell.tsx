import Link from "next/link";
import type { RecordMeta, RecordMode } from "@/lib/records/mode";
import { RECORD_MODES, RECORD_MODE_LABEL } from "@/lib/records/mode";
import type { TieOut } from "@/lib/records/tieout";
import { formatCents } from "@/lib/money";
import { PrintButton } from "./PrintButton";

// The shared shell every Feature 8 record renders inside: a print-ready header
// (client · year · mode · snapshot hash · generated-at), a mode switch, the
// body, and a tie-out footer that reconciles the record to the return lines it
// summarizes. Readable at phone width; tables scroll inside their own box.

export function RecordShell({
  title,
  slug,
  meta,
  tieOuts = [],
  children,
}: {
  title: string;
  slug: string;
  meta: RecordMeta;
  tieOuts?: TieOut[];
  children: React.ReactNode;
}) {
  return (
    <div className="record space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 pb-2">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-xs text-slate-500">
            {meta.client} · TY{meta.taxYear} · {meta.modeLabel} · snapshot{" "}
            <span className="mono">{meta.snapshotHash}</span> · generated {meta.generatedAt.slice(0, 16).replace("T", " ")} ·
            packet <span className="mono">{meta.packetSha}</span>
          </p>
        </div>
        <div className="no-print flex items-center gap-2 text-xs">
          <div className="flex overflow-hidden rounded border border-slate-300">
            {RECORD_MODES.map((m: RecordMode) => (
              <Link
                key={m}
                href={`/records/${slug}?mode=${m}`}
                className={`px-2 py-1 no-underline ${m === meta.mode ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}
              >
                {RECORD_MODE_LABEL[m]}
              </Link>
            ))}
          </div>
          <PrintButton />
        </div>
      </div>

      {children}

      <TieOutFooter tieOuts={tieOuts} />

      <p className="print-only mt-6 border-t border-slate-300 pt-2 text-[10px] text-slate-500">
        {meta.client} · TY{meta.taxYear} · {meta.modeLabel} · snapshot {meta.snapshotHash} · page <span className="pageno" />
      </p>
    </div>
  );
}

function TieOutFooter({ tieOuts }: { tieOuts: TieOut[] }) {
  if (tieOuts.length === 0) return null;
  const allOk = tieOuts.every((t) => t.ties);
  return (
    <div className={`card p-3 text-sm ${allOk ? "" : "border-red-300"}`}>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Tie-out</div>
      <ul className="space-y-0.5">
        {tieOuts.map((t) => (
          <li key={t.lineKey} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {t.label} → <Link href={`/line/v3/${encodeURIComponent(t.lineKey)}`} className="mono">{t.lineKey}</Link>
            </span>
            <span className="mono">
              {formatCents(t.recordTotal)} vs {formatCents(t.lineValue)}{" "}
              {t.ties ? (
                <span className="text-emerald-700">✓</span>
              ) : (
                <span className="text-red-700">✗ Δ {formatCents(t.delta)}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {!allOk ? <p className="mt-1 text-xs text-red-700">A failed tie-out is raised as a TIE_OUT check finding.</p> : null}
    </div>
  );
}
