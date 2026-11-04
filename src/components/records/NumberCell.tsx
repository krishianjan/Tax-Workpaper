import Link from "next/link";
import { formatCents, type Cents } from "@/lib/money";

// Every number on a record links to its recipe/evidence (the line page carries
// the trace tree), and carries a badge when an adjustment or judgment shaped it.
export function NumberCell({
  cents,
  lineKey,
  version = "v3",
  adjusted,
  decisionId,
}: {
  cents: Cents | null;
  lineKey?: string;
  version?: string;
  adjusted?: boolean;
  decisionId?: string;
}) {
  const body = <span className="mono tabular-nums">{formatCents(cents)}</span>;
  return (
    <span className="inline-flex items-center gap-1">
      {lineKey ? (
        <Link href={`/line/${version}/${encodeURIComponent(lineKey)}`} className="no-underline hover:underline">
          {body}
        </Link>
      ) : (
        body
      )}
      {adjusted ? <span className="chip bg-amber-100 text-amber-800">adj</span> : null}
      {decisionId ? (
        <Link href={`/decisions/${decisionId}`} className="chip bg-violet-100 text-violet-800 no-underline">
          judgment
        </Link>
      ) : null}
    </span>
  );
}
