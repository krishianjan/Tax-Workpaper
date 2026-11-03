import type { PacketDocument } from "../packet/schema";
import type { PacketModel } from "../packet/model";
import { toCents } from "../money";

// "Link related items." Auto-link documents by same issuer identity + document
// type + tax year, then compare money values:
//   all equal        -> duplicate_of  (D10 -> D09; keep both, D10 is evidence)
//   marked_corrected -> supersedes    (D31 -> D30) with a field-by-field diff

export type LinkKind = "duplicate_of" | "supersedes" | "same_issuer" | "related_prior_year";

export interface DocumentLinkResult {
  fromDocId: string;
  toDocId: string;
  kind: LinkKind;
  method: "auto";
  basis: Record<string, unknown>;
}

/** A document's issuer identity: its EIN if any extracted value carries one, else issuer name. */
export function docIssuerKey(model: PacketModel, doc: PacketDocument): string {
  const evs = model.evsByDoc.get(doc.id) ?? [];
  const ein = evs.find((e) => e.value_type === "ein");
  if (ein) return "ein:" + String(ein.value).replace(/\D/g, "");
  return "issuer:" + (doc.issuer ?? "").toLowerCase().trim();
}

function moneyFingerprint(model: PacketModel, doc: PacketDocument): string {
  const evs = model.evsByDoc.get(doc.id) ?? [];
  const pairs = evs
    .filter((e) => e.value_type === "money")
    .map((e) => `${e.field}=${toCents(e.value)?.toString() ?? "null"}`)
    .sort();
  return pairs.join("|");
}

function fieldValueMap(model: PacketModel, doc: PacketDocument): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of model.evsByDoc.get(doc.id) ?? []) m.set(e.field, String(e.value));
  return m;
}

function diffDocs(model: PacketModel, a: PacketDocument, b: PacketDocument) {
  const ma = fieldValueMap(model, a);
  const mb = fieldValueMap(model, b);
  const fields = new Set([...ma.keys(), ...mb.keys()]);
  const changed: Array<{ field: string; old: string | null; new: string | null }> = [];
  for (const f of fields) {
    const oa = ma.get(f) ?? null;
    const ob = mb.get(f) ?? null;
    if (oa !== ob) changed.push({ field: f, old: oa, new: ob });
  }
  return changed;
}

export function computeDocumentLinks(model: PacketModel): DocumentLinkResult[] {
  const links: DocumentLinkResult[] = [];
  const groups = new Map<string, PacketDocument[]>();
  for (const d of model.documents) {
    const key = `${docIssuerKey(model, d)}::${d.document_type}::${d.tax_year}`;
    const arr = groups.get(key);
    if (arr) arr.push(d);
    else groups.set(key, [d]);
  }

  for (const docs of groups.values()) {
    if (docs.length < 2) continue;
    const sorted = [...docs].sort((a, b) => a.id.localeCompare(b.id));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];
        const corrected = b.marked_corrected ? b : a.marked_corrected ? a : null;
        if (corrected) {
          const other = corrected === a ? b : a;
          links.push({
            fromDocId: corrected.id,
            toDocId: other.id,
            kind: "supersedes",
            method: "auto",
            basis: {
              reason: "Issuer marked CORRECTED",
              diff: diffDocs(model, other, corrected),
            },
          });
        } else if (moneyFingerprint(model, a) === moneyFingerprint(model, b)) {
          // Keep the one appearing in the current return as canonical.
          const used = currentlyUsed(model);
          const keep = used.has(a.id) ? a : used.has(b.id) ? b : a;
          const dup = keep === a ? b : a;
          links.push({
            fromDocId: dup.id,
            toDocId: keep.id,
            kind: "duplicate_of",
            method: "auto",
            basis: { reason: "Same issuer, type, year and identical money values" },
          });
        } else {
          links.push({
            fromDocId: a.id,
            toDocId: b.id,
            kind: "same_issuer",
            method: "auto",
            basis: { reason: "Same issuer, type and year; values differ" },
          });
        }
      }
    }
  }
  return links;
}

function currentlyUsed(model: PacketModel): Set<string> {
  const v = model.versions[model.versions.length - 1];
  return new Set(v?.documents_used ?? []);
}

/** Within one document: pages whose normalized content is identical (D23 p3 = p2). */
export function computePageDuplicates(doc: PacketDocument): Array<{ pageNo: number; duplicateOfPage: number }> {
  const out: Array<{ pageNo: number; duplicateOfPage: number }> = [];
  const seen = new Map<string, number>();
  for (const p of doc.pages) {
    const norm = normalizePage(p.printed_content);
    const prev = seen.get(norm);
    if (prev !== undefined) out.push({ pageNo: p.page, duplicateOfPage: prev });
    else seen.set(norm, p.page);
  }
  return out;
}

/** Strip parenthetical scanner notes and whitespace before comparing pages. */
export function normalizePage(content: string): string {
  return content
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
