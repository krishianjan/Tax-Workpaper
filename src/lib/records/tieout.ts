import type { Cents } from "../money";

// Every record reconciles to the return line(s) it summarizes. A tie-out footer
// shows "Ties to F1040.7 ✓" or the gap. A failed tie-out is surfaced as a
// CheckResult (see checks/tieOut.ts) so nobody has to notice it by eye.

export interface TieOut {
  label: string; // human line, e.g. "Capital gain"
  lineKey: string; // "F1040.7"
  recordTotal: Cents; // what the record's detail adds to
  lineValue: Cents | null; // the return line it should equal
  delta: Cents; // recordTotal - lineValue (0 when tied)
  ties: boolean;
  toleranceCents: Cents;
}

/** Reconcile a record subtotal to a return line, within a cents tolerance. */
export function tieOut(
  label: string,
  lineKey: string,
  recordTotal: Cents,
  lineValue: Cents | null,
  toleranceCents: Cents = 0n,
): TieOut {
  const lv = lineValue ?? 0n;
  const delta = recordTotal - lv;
  const abs = delta < 0n ? -delta : delta;
  return { label, lineKey, recordTotal, lineValue, delta, ties: abs <= toleranceCents, toleranceCents };
}

export function allTie(tieOuts: TieOut[]): boolean {
  return tieOuts.every((t) => t.ties);
}
