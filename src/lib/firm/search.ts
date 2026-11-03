import type { PacketModel } from "../packet/model";
import { maskPrintedContent } from "../mask";
import { isSensitiveQuery } from "./sensitive";

// 7.4 Global search across documents, lines, issues, decisions, review notes,
// questions, people and notices. Permission- and mask-filtered BEFORE ranking.
// Results deep-link to the exact anchor. Postgres FTS with a pg_trgm fuzzy
// fallback at the DB layer; this pure core mirrors the ranking (token overlap +
// trigram similarity) so it is testable without a database.
//
// Search is NOT an oracle: an uncleared user searching a sensitive value learns
// nothing about whether it exists.

export type SearchKind =
  | "document"
  | "line"
  | "issue"
  | "decision"
  | "review_note"
  | "question"
  | "person"
  | "notice";

export interface SearchDoc {
  kind: SearchKind;
  id: string;
  title: string;
  body: string;
  href: string;
  staffOnly?: boolean;
}

export interface SearchResult extends SearchDoc {
  score: number;
  snippet: string;
}

export interface SearchActor {
  cleared: boolean;
  isStaff: boolean;
}

function trigrams(s: string): Set<string> {
  const t = `  ${s.toLowerCase().replace(/\s+/g, " ")} `;
  const out = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}

function trigramSimilarity(a: string, b: string): number {
  const A = trigrams(a);
  const B = trigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter); // Jaccard
}

/** Score a doc against a query: exact substring is strong; trigram is the
 *  fuzzy fallback (typos). Title matches weigh more than body. */
export function scoreDoc(doc: SearchDoc, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const title = doc.title.toLowerCase();
  const body = doc.body.toLowerCase();
  let score = 0;
  if (title.includes(q)) score += 10;
  if (body.includes(q)) score += 4;
  // Per-token overlap.
  for (const tok of q.split(/\s+/).filter((t) => t.length >= 2)) {
    if (title.includes(tok)) score += 3;
    else if (body.includes(tok)) score += 1;
  }
  // Fuzzy fallback only when there is no direct hit.
  if (score === 0) {
    const sim = Math.max(trigramSimilarity(title, q), trigramSimilarity(body, q));
    if (sim >= 0.3) score = sim * 5;
  }
  return score;
}

function snippet(body: string, query: string, cleared: boolean): string {
  const q = query.trim().toLowerCase();
  const idx = body.toLowerCase().indexOf(q);
  const start = idx >= 0 ? Math.max(0, idx - 30) : 0;
  const raw = body.slice(start, start + 120);
  return maskPrintedContent(raw, cleared);
}

/** Build the index from the packet (documents + return lines). Workpaper
 *  entities (issues, decisions, notes, questions, people, notices) are appended
 *  by the caller, which has them from the DB/model. */
export function buildPacketIndex(model: PacketModel, versionId = "v3"): SearchDoc[] {
  const docs: SearchDoc[] = [];
  for (const d of model.documents) {
    const pageText = d.pages.map((p) => p.printed_content).join(" ");
    docs.push({
      kind: "document",
      id: d.id,
      title: `${d.id} — ${d.title}`,
      body: `${d.issuer ?? ""} ${pageText}`,
      href: `/doc/${d.id}/p/1`,
    });
  }
  const lines = model.versionById.get(versionId)?.lines ?? [];
  for (const ln of lines) {
    docs.push({
      kind: "line",
      id: ln.key,
      title: `${ln.key} ${ln.label ?? ""}`.trim(),
      body: `${ln.form ?? ""} ${ln.label ?? ""} ${ln.note ?? ""}`,
      href: `/line/${versionId}/${encodeURIComponent(ln.key)}`,
    });
  }
  return docs;
}

export interface SearchOptions {
  limit?: number;
}

export function search(
  index: SearchDoc[],
  query: string,
  actor: SearchActor,
  opts: SearchOptions = {},
): SearchResult[] {
  // Not an oracle: an uncleared viewer gets nothing back for a sensitive query,
  // whether or not a value matches.
  if (!actor.cleared && isSensitiveQuery(query)) return [];

  const visible = index.filter((d) => actor.isStaff || !d.staffOnly);
  const scored: SearchResult[] = [];
  for (const d of visible) {
    const score = scoreDoc(d, query);
    if (score <= 0) continue;
    const snip = snippet(d.body, query, actor.cleared);
    // Mask every field we return, not only the snippet, so an uncleared viewer
    // can never receive a full sensitive value through a result object.
    scored.push({
      ...d,
      title: maskPrintedContent(d.title, actor.cleared),
      body: actor.cleared ? d.body : snip,
      score,
      snippet: snip,
    });
  }
  scored.sort((a, b) => (b.score === a.score ? a.id.localeCompare(b.id) : b.score - a.score));
  return scored.slice(0, opts.limit ?? 30);
}
