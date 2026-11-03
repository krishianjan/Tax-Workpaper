import type { CheckResult, CheckStatus } from "@/lib/checks/types";
import type { PacketModel } from "@/lib/packet/model";
import { resolveRef } from "@/lib/refs/resolve";
import { formatCents } from "@/lib/money";
import { RefLink } from "./ui";

const STATUS: Record<CheckStatus, string> = {
  fail: "bg-red-100 text-red-800",
  warn: "bg-amber-100 text-amber-800",
  info: "bg-slate-100 text-slate-600",
  pass: "bg-emerald-100 text-emerald-800",
};

function effect(cents: bigint | null | undefined): string | null {
  if (cents === null || cents === undefined || cents === 0n) return null;
  return formatCents(cents);
}

export function FindingCard({
  r,
  model,
  versionId,
}: {
  r: CheckResult;
  model: PacketModel;
  versionId: string;
}) {
  const fed = effect(r.taxEffectFed);
  const ca = effect(r.taxEffectCa);
  return (
    <div id={r.id} className="card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`chip ${STATUS[r.status]}`}>{r.status}</span>
        <span className="chip bg-sky-100 text-sky-800">{r.area}</span>
        <span className="mono text-xs text-slate-400">{r.checkId}</span>
        {r.judgment ? <span className="chip bg-violet-100 text-violet-800">judgment — not auto-applied</span> : null}
        <span className="mono text-[0.7rem] text-slate-300">#{r.id}</span>
      </div>
      <h3 className="mt-1 font-medium">{r.title}</h3>
      <p className="mt-1 text-sm text-slate-600">{r.explanation}</p>

      {(r.expected !== undefined || r.actual !== undefined || fed || ca) && (
        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          {r.expected !== undefined ? (
            <div>
              <span className="text-xs uppercase text-slate-400">Expected</span>
              <div className="mono">{String(r.expected)}</div>
            </div>
          ) : null}
          {r.actual !== undefined ? (
            <div>
              <span className="text-xs uppercase text-slate-400">Engine</span>
              <div className="mono">{String(r.actual)}</div>
            </div>
          ) : null}
          {fed ? (
            <div>
              <span className="text-xs uppercase text-slate-400">Tax effect (fed)</span>
              <div className="mono">{fed}</div>
            </div>
          ) : null}
          {ca ? (
            <div>
              <span className="text-xs uppercase text-slate-400">Tax effect (CA)</span>
              <div className="mono">{ca}</div>
            </div>
          ) : null}
        </div>
      )}

      {r.refs.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {r.refs.slice(0, 12).map((raw, i) => {
            const res = resolveRef(model, raw, versionId);
            return <RefLink key={i} href={res.href} label={raw} />;
          })}
        </div>
      ) : null}
    </div>
  );
}
