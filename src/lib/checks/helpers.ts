import type { PacketModel } from "../packet/model";
import type { PacketReturnLine } from "../packet/schema";
import { toCents, type Cents } from "../money";

export function line(model: PacketModel, versionId: string, key: string): PacketReturnLine | undefined {
  return model.lineByVersionKey.get(versionId)?.get(key);
}

export function linesOf(model: PacketModel, versionId: string): PacketReturnLine[] {
  return model.versionById.get(versionId)?.lines ?? [];
}

export function lineValueCents(ln: PacketReturnLine | undefined): Cents | null {
  if (!ln) return null;
  return toCents(ln.value);
}

/** Box letter for an 8949 line key like F8949.B.N1 -> "B". */
export function box8949(key: string): string | null {
  const parts = key.split(".");
  return parts.length >= 2 ? parts[1] : null;
}

/** Short-term boxes are A/B/C; long-term are D/E/F; digital is often H. */
export function isShortTermBox(box: string | null): boolean {
  return box === "A" || box === "B" || box === "C";
}

export interface Lot8949 {
  key: string;
  box: string | null;
  acquired: string | null;
  sold: string | null;
  proceeds: Cents | null;
  basis: Cents | null;
  shares: number | null;
  raw: string;
}

const LOT_RE =
  /acquired\s+([0-9]{4}-[0-9]{2}-[0-9]{2}|various)[,;]?\s*sold\s+([0-9]{4}-[0-9]{2}-[0-9]{2}|various)[;,]?\s*proceeds\s+([\d,]+\.\d{2})[;,]?\s*basis\s+([\d,]+\.\d{2}|not reported|\(not reported\))/i;

/** Parse an 8949 lot's acquired/sold/proceeds/basis from its label. */
export function parseLot(ln: PacketReturnLine): Lot8949 {
  const label = ln.label ?? "";
  const m = label.match(LOT_RE);
  const sharesMatch = label.match(/([\d.]+)\s*sh\b/i);
  return {
    key: ln.key,
    box: box8949(ln.key),
    acquired: m ? (m[1] === "various" ? null : m[1]) : null,
    sold: m ? (m[2] === "various" ? null : m[2]) : null,
    proceeds: m ? toCents(m[3]) : toCents(ln.value),
    basis: m ? (/not reported/i.test(m[4]) ? null : toCents(m[4])) : null,
    shares: sharesMatch ? Number(sharesMatch[1]) : null,
    raw: label,
  };
}

export function all8949Lots(model: PacketModel, versionId: string): Lot8949[] {
  return linesOf(model, versionId)
    .filter((l) => l.form === "F8949" && !/total/i.test(l.key))
    .map(parseLot);
}

export function sumCents(values: Array<Cents | null>): Cents {
  let s = 0n;
  for (const v of values) if (v !== null) s += v;
  return s;
}

/** Extracted money values on a document whose field matches a regex. */
export function docMoneyEvs(model: PacketModel, docId: string, fieldRe: RegExp) {
  return (model.evsByDoc.get(docId) ?? []).filter((e) => e.value_type === "money" && fieldRe.test(e.field));
}
