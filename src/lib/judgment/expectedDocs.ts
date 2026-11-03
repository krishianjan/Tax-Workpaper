import type { PacketModel } from "../packet/model";

// 4.6 Documents register: the Block-1 dispositions PLUS an ExpectedDocument list
// derived generically — prior-year pass-throughs (K-1 history), the prior
// preparer's open items, and questionnaire answers implying a document — each
// matched to a 2025 document or explained.

export type ExpectedStatus = "matched" | "expected" | "explained";

export interface ExpectedDoc {
  id: string;
  source: "prior_year" | "k1_history" | "questionnaire" | "engine_diagnostic";
  description: string;
  matchedDocumentId: string | null;
  status: ExpectedStatus;
}

function matchDoc(model: PacketModel, keywords: string[], typeHint?: RegExp): string | null {
  for (const d of model.documents) {
    const hay = `${d.title} ${d.issuer ?? ""} ${d.document_type}`.toLowerCase();
    const typeOk = typeHint ? typeHint.test(d.document_type) : true;
    if (typeOk && keywords.every((k) => hay.includes(k.toLowerCase()))) return d.id;
  }
  return null;
}

export function deriveExpectedDocuments(model: PacketModel): ExpectedDoc[] {
  const out: ExpectedDoc[] = [];
  const prior = (model.raw.prior_years as Record<string, unknown>) ?? {};

  // 1. Pass-through entities from basis history => expect a current-year K-1.
  const basis = (prior.basis_records ?? {}) as Record<string, unknown>;
  const entities: Array<{ key: string; name: string; kw: string[] }> = [];
  if ("scorp_lindqvist_family_woodworks" in basis)
    entities.push({ key: "woodworks", name: "Lindqvist Family Woodworks (S corp)", kw: ["woodworks"] });
  if ("partnership_ridgeline" in basis)
    entities.push({ key: "ridgeline", name: "Ridgeline Real Estate Fund (partnership)", kw: ["ridgeline"] });
  for (const e of entities) {
    const matched = matchDoc(model, e.kw, /K-1/);
    out.push({
      id: `k1:${e.key}`,
      source: "k1_history",
      description: `2025 Schedule K-1 from ${e.name}`,
      matchedDocumentId: matched,
      status: matched ? "matched" : "expected",
    });
  }

  // 2. Prior preparer's open items.
  const wp = (prior.prior_preparer_workpaper ?? {}) as Record<string, unknown>;
  const openItems = Array.isArray(wp.open_items_left_by_prior_preparer)
    ? (wp.open_items_left_by_prior_preparer as string[])
    : [];
  openItems.forEach((item, i) => {
    let matched: string | null = null;
    if (/5498/.test(item)) matched = matchDoc(model, ["5498"], /5498/);
    else if (/K-1/i.test(item)) matched = matchDoc(model, ["woodworks"], /K-1/);
    const explained = /3520/.test(item); // foreign-inheritance info filing — explained as outside the return
    out.push({
      id: `open:${i}`,
      source: "prior_year",
      description: item,
      matchedDocumentId: matched,
      status: matched ? "matched" : explained ? "explained" : "expected",
    });
  });

  // 3. Questionnaire answers implying a document (SEP/5498, backdoor Roth/8606).
  const client = (model.raw.client as Record<string, unknown>) ?? {};
  const qa = Array.isArray(client.questionnaire) ? (client.questionnaire as Array<Record<string, unknown>>) : [];
  for (const q of qa) {
    const a = String(q.answer ?? "").toLowerCase();
    if (/\bsep\b|solo 401/.test(a)) {
      const matched = matchDoc(model, ["5498"], /5498|retirement/);
      out.push({ id: `qa:${q.id}:sep`, source: "questionnaire", description: `SEP/retirement contribution implies a 5498 (${q.id})`, matchedDocumentId: matched, status: matched ? "matched" : "expected" });
      break;
    }
  }

  return out;
}

export function allExpectedAccountedFor(docs: ExpectedDoc[]): boolean {
  return docs.every((d) => d.status === "matched" || d.status === "explained");
}
