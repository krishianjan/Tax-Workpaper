import type { PacketExtractedValue, PacketDocument } from "../packet/schema";
import type { PacketModel } from "../packet/model";
import { toCents } from "../money";

// "Record how each number was verified." Ground truth is the page's
// printed_content (readme truth hierarchy #1), NOT text_as_read and NOT
// confidence. The pipeline can read a high-confidence value that is simply not
// what the page says (D62: EIN read 74-3829516, page prints 74-3829156).

export type VerificationStatus =
  | "agreed_to_source"
  | "mismatch_with_source"
  | "not_printed"
  | "needs_human";

export interface AutoVerification {
  extractedValueId: string;
  status: VerificationStatus;
  method: "auto";
  matched: boolean;
  confidence: number;
  sourceText: string | null; // snippet from the page that we matched against
  note: string;
}

const MISSING_MARKERS = ["(not reported)", "not reported", "unknown", "n/a", "none provided"];

function digits(s: string): string {
  return s.replace(/\D/g, "");
}

function normText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** All money-like tokens on a page, as cents. */
function moneyCentsOnPage(printed: string): Set<string> {
  const out = new Set<string>();
  const re = /-?\(?\$?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\)?|-?\$?\d+(?:\.\d{1,2})?/g;
  for (const m of printed.match(re) ?? []) {
    const c = toCents(m.replace(/[$()]/g, ""));
    if (c !== null) out.add(c.toString());
  }
  return out;
}

/** All digit-runs on a page (for EIN/SSN/account comparisons). */
function digitRuns(printed: string): Set<string> {
  const out = new Set<string>();
  for (const m of printed.match(/[\d-]{5,}/g) ?? []) {
    const d = digits(m);
    if (d.length >= 4) out.add(d);
  }
  return out;
}

function dateKeys(s: string): string[] {
  // Produce YYYYMMDD keys from ISO or MM/DD/YYYY.
  const keys: string[] = [];
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) keys.push(`${iso[1]}${iso[2]}${iso[3]}`);
  const us = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (us) {
    const yr = us[3].length === 2 ? "20" + us[3] : us[3];
    keys.push(`${yr}${us[1].padStart(2, "0")}${us[2].padStart(2, "0")}`);
  }
  return keys;
}

function datesOnPage(printed: string): Set<string> {
  const out = new Set<string>();
  const re = /\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}/g;
  for (const m of printed.match(re) ?? []) for (const k of dateKeys(m)) out.add(k);
  return out;
}

function snippet(printed: string, needle: string): string | null {
  const i = normText(printed).indexOf(normText(needle));
  if (i < 0) return null;
  const start = Math.max(0, i - 20);
  return printed.slice(start, i + needle.length + 20).replace(/\s+/g, " ").trim();
}

/**
 * Decide whether the extracted value agrees with what the page prints.
 * Returns match + an optional matched snippet.
 */
function matchAgainstPage(ev: PacketExtractedValue, printed: string): { matched: boolean; sourceText: string | null } {
  const type = ev.value_type;
  const value = ev.value;

  // text_as_read verbatim is strong evidence when present and found on the page.
  if (ev.text_as_read && normText(printed).includes(normText(ev.text_as_read))) {
    // but for identifier types, still require digit agreement below
    if (type !== "ein" && type !== "ssn" && type !== "account_number") {
      return { matched: true, sourceText: snippet(printed, ev.text_as_read) };
    }
  }

  switch (type) {
    case "money": {
      const c = toCents(value);
      if (c === null) return { matched: false, sourceText: null };
      const onPage = moneyCentsOnPage(printed);
      return { matched: onPage.has(c.toString()), sourceText: null };
    }
    case "ein":
    case "ssn":
    case "account_number": {
      const want = digits(String(value));
      if (want.length < 4) return { matched: false, sourceText: null };
      const runs = digitRuns(printed);
      return { matched: runs.has(want), sourceText: null };
    }
    case "date": {
      const want = dateKeys(String(value));
      if (want.length === 0) return { matched: false, sourceText: null };
      const onPage = datesOnPage(printed);
      return { matched: want.some((k) => onPage.has(k)), sourceText: null };
    }
    case "percent": {
      const num = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(num)) return { matched: false, sourceText: null };
      const pct = num <= 1 ? num * 100 : num;
      const candidates = [`${pct}%`, `${pct.toFixed(0)}%`, `${pct.toFixed(1)}%`, String(num)];
      for (const cand of candidates) {
        const s = snippet(printed, cand);
        if (s) return { matched: true, sourceText: s };
      }
      return { matched: false, sourceText: null };
    }
    case "boolean": {
      const truthy = value === true || /^(true|yes|x|checked)$/i.test(String(value));
      if (!truthy) return { matched: true, sourceText: null }; // false/absent: nothing to find
      for (const cand of ["X", "checked", "yes", "☑", "[x]"]) {
        const s = snippet(printed, cand);
        if (s) return { matched: true, sourceText: s };
      }
      return { matched: false, sourceText: null };
    }
    case "integer":
    case "quantity": {
      const want = String(value).trim();
      const s = snippet(printed, want);
      return { matched: s !== null, sourceText: s };
    }
    default: {
      // text | code
      const want = String(value).trim();
      if (want === "") return { matched: false, sourceText: null };
      const s = snippet(printed, want);
      return { matched: s !== null, sourceText: s };
    }
  }
}

export function verifyValue(model: PacketModel, ev: PacketExtractedValue): AutoVerification {
  const doc = model.docById.get(ev.document_id);
  const page = doc?.pages.find((p) => p.page === (ev.page ?? 1));
  const printed = page?.printed_content ?? "";

  // "Missing ≠ zero": a blank or (not reported) read is not_printed, never 0.
  const marker = MISSING_MARKERS.some((m) => normText(ev.text_as_read).includes(m));
  if (ev.text_as_read.trim() === "" || marker) {
    const status: VerificationStatus =
      ev.confidence < 0.6 ? "needs_human" : "not_printed";
    return {
      extractedValueId: ev.id,
      status: ev.text_as_read.trim() === "" ? "not_printed" : status,
      method: "auto",
      matched: false,
      confidence: ev.confidence,
      sourceText: null,
      note:
        ev.text_as_read.trim() === ""
          ? "Nothing printed for this field; stored as not_printed (never silently 0)."
          : `Marked '${ev.text_as_read}'; treated as not printed, not zero.`,
    };
  }

  const { matched, sourceText } = matchAgainstPage(ev, printed);

  // Confidence < 0.6 always needs a human, even on a match (readme edge case).
  if (ev.confidence < 0.6) {
    return {
      extractedValueId: ev.id,
      status: "needs_human",
      method: "auto",
      matched,
      confidence: ev.confidence,
      sourceText,
      note: `Low confidence (${ev.confidence}); a human must confirm regardless of text match.`,
    };
  }

  if (matched) {
    return {
      extractedValueId: ev.id,
      status: "agreed_to_source",
      method: "auto",
      matched: true,
      confidence: ev.confidence,
      sourceText,
      note: "Extracted value found in the page's printed content.",
    };
  }

  return {
    extractedValueId: ev.id,
    status: "mismatch_with_source",
    method: "auto",
    matched: false,
    confidence: ev.confidence,
    sourceText: null,
    note: `Extracted value not found on the page as printed (confidence ${ev.confidence}). Human review required.`,
  };
}

export function verifyAll(model: PacketModel): AutoVerification[] {
  return model.raw.extracted_values.map((ev) => verifyValue(model, ev));
}

export function verificationSummary(results: AutoVerification[]): Record<VerificationStatus, number> {
  const out: Record<VerificationStatus, number> = {
    agreed_to_source: 0,
    mismatch_with_source: 0,
    not_printed: 0,
    needs_human: 0,
  };
  for (const r of results) out[r.status] += 1;
  return out;
}
