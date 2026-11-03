import Link from "next/link";
import type { VerificationStatus } from "@/lib/evidence/verify";
import type { DispositionStatus } from "@/lib/evidence/disposition";

const VERIFY_STYLES: Record<VerificationStatus, string> = {
  agreed_to_source: "bg-emerald-100 text-emerald-800",
  mismatch_with_source: "bg-red-100 text-red-800",
  not_printed: "bg-amber-100 text-amber-800",
  needs_human: "bg-violet-100 text-violet-800",
};

const VERIFY_LABEL: Record<VerificationStatus, string> = {
  agreed_to_source: "Agrees to source",
  mismatch_with_source: "Mismatch with source",
  not_printed: "Not printed",
  needs_human: "Needs human",
};

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  return <span className={`chip ${VERIFY_STYLES[status]}`}>{VERIFY_LABEL[status]}</span>;
}

const DISP_STYLES: Record<DispositionStatus, string> = {
  used: "bg-emerald-100 text-emerald-800",
  duplicate_not_counted: "bg-sky-100 text-sky-800",
  superseded: "bg-slate-200 text-slate-700",
  partial_extraction: "bg-amber-100 text-amber-800",
  structured_elsewhere: "bg-sky-100 text-sky-800",
  received_after_return: "bg-indigo-100 text-indigo-800",
  unaccounted: "bg-red-100 text-red-800",
};

export function DispositionChip({ status }: { status: DispositionStatus }) {
  return <span className={`chip ${DISP_STYLES[status]}`}>{status.replace(/_/g, " ")}</span>;
}

export function Confidence({ value }: { value: number }) {
  const low = value < 0.6;
  return (
    <span className={`chip ${low ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-600"}`}>
      conf {value.toFixed(2)}
    </span>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{children}</h2>;
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

export function RefLink({ href, label }: { href?: string; label: string }) {
  if (!href) return <span className="mono text-slate-600">{label}</span>;
  return (
    <Link href={href} className="mono">
      {label}
    </Link>
  );
}
