import type { PacketModel } from "../packet/model";
import type { PacketReturnVersion } from "../packet/schema";
import { computeDocumentLinks } from "./links";

// "Prove completeness." Every one of the 74 documents must have a
// non-`unaccounted` disposition. A doc in no current-version documents_used
// needs an explicit, time-aware reason.

export type DispositionStatus =
  | "used"
  | "duplicate_not_counted"
  | "superseded"
  | "partial_extraction"
  | "structured_elsewhere"
  | "received_after_return"
  | "unaccounted";

export interface DispositionResult {
  documentId: string;
  status: DispositionStatus;
  reason: string;
  refs: string[];
  partialExtraction: boolean; // used docs can still be partially extracted
}

export const DEFAULT_AS_OF = "2026-06-24T00:00:00Z";

/** The latest version computed at or before the as-of clock. */
export function currentVersion(model: PacketModel, asOf: string = DEFAULT_AS_OF): PacketReturnVersion | undefined {
  const t = Date.parse(asOf);
  const eligible = model.versions.filter((v) => Date.parse(v.computed_at) <= t);
  return eligible.length ? eligible[eligible.length - 1] : model.versions[model.versions.length - 1];
}

export function computeDispositions(model: PacketModel, asOf: string = DEFAULT_AS_OF): DispositionResult[] {
  const cur = currentVersion(model, asOf);
  const used = new Set(cur?.documents_used ?? []);
  const asOfMs = Date.parse(asOf);

  // Supersede / duplicate relationships from the generic linker.
  const links = computeDocumentLinks(model);
  const supersededBy = new Map<string, string>(); // oldDocId -> newDocId
  const duplicateOf = new Map<string, string>(); // dupDocId -> keptDocId
  for (const l of links) {
    if (l.kind === "supersedes") supersededBy.set(l.toDocId, l.fromDocId);
    if (l.kind === "duplicate_of") duplicateOf.set(l.fromDocId, l.toDocId);
  }
  // Also honor versions' explicit documents_superseded.
  for (const v of model.versions) for (const d of v.documents_superseded) if (!supersededBy.has(d)) supersededBy.set(d, "");

  return model.documents.map((doc) => {
    const partial = doc.extraction.status === "partial";
    const receivedMs = doc.received_at ? Date.parse(doc.received_at) : NaN;

    // 1. Received after the current return — time-aware.
    if (!Number.isNaN(receivedMs) && receivedMs > asOfMs) {
      return {
        documentId: doc.id,
        status: "received_after_return",
        reason: `Received ${doc.received_at}, after the current return (${cur?.version} @ ${cur?.computed_at}).`,
        refs: [],
        partialExtraction: partial,
      };
    }

    // 2. Counted in the current return.
    if (used.has(doc.id)) {
      const dupTarget = duplicateOf.get(doc.id);
      const reason = dupTarget
        ? `Used; a duplicate image of ${dupTarget} — counted once.`
        : doc.extraction.status === "not_extracted"
          ? `Used; not OCR-extracted — ${doc.extraction.reason ?? "content structured elsewhere"}.`
          : partial
            ? `Used; partially extracted — ${doc.extraction.reason ?? "some pages unread"}.`
            : "Used in the current return.";
      return { documentId: doc.id, status: "used", reason, refs: [], partialExtraction: partial };
    }

    // 3. Not used — assign a reason.
    const newer = supersededBy.get(doc.id);
    if (newer !== undefined) {
      return {
        documentId: doc.id,
        status: "superseded",
        reason: newer ? `Superseded by ${newer} (issuer CORRECTED).` : "Superseded in a later version.",
        refs: newer ? [newer] : [],
        partialExtraction: partial,
      };
    }
    const kept = duplicateOf.get(doc.id);
    if (kept) {
      return {
        documentId: doc.id,
        status: "duplicate_not_counted",
        reason: `Duplicate of ${kept}; counted once.`,
        refs: [kept],
        partialExtraction: partial,
      };
    }
    if (doc.extraction.status === "not_extracted") {
      return {
        documentId: doc.id,
        status: "structured_elsewhere",
        reason: doc.extraction.reason ?? "Not extracted; reproduced as structured data.",
        refs: [],
        partialExtraction: partial,
      };
    }
    if (partial) {
      return {
        documentId: doc.id,
        status: "partial_extraction",
        reason: doc.extraction.reason ?? "Only part of the document was extracted.",
        refs: [],
        partialExtraction: true,
      };
    }

    return {
      documentId: doc.id,
      status: "unaccounted",
      reason: "No disposition could be determined — this is an error state and must be resolved.",
      refs: [],
      partialExtraction: partial,
    };
  });
}

export function dispositionSummary(results: DispositionResult[]) {
  const total = results.length;
  const accounted = results.filter((r) => r.status !== "unaccounted").length;
  const byStatus: Record<string, number> = {};
  for (const r of results) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  return { total, accounted, byStatus };
}
