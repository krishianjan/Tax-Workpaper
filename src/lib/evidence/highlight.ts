import type { PacketExtractedValue } from "../packet/schema";

// Highlighting: find text_as_read (or a formatted value) inside printed_content
// to get character offsets. If it can't be found, that is itself a finding
// ("Not found on page"). The synthetic position is only for the PDF stub.

export interface HighlightSpan {
  start: number;
  end: number;
}

export interface LocateResult {
  found: boolean;
  span: HighlightSpan | null;
  needle: string | null;
}

function candidates(ev: PacketExtractedValue): string[] {
  const out: string[] = [];
  if (ev.text_as_read && ev.text_as_read.trim() !== "") out.push(ev.text_as_read.trim());
  const v = ev.value;
  if (typeof v === "number") {
    out.push(String(v));
    out.push(v.toLocaleString("en-US"));
    out.push(v.toLocaleString("en-US", { minimumFractionDigits: 2 }));
  } else if (typeof v === "string" && v.trim() !== "") {
    out.push(v.trim());
  }
  return [...new Set(out)];
}

/** Locate the extracted value in the page's printed content, case-insensitively. */
export function locate(ev: PacketExtractedValue, printedContent: string): LocateResult {
  const hay = printedContent.toLowerCase();
  for (const cand of candidates(ev)) {
    const i = hay.indexOf(cand.toLowerCase());
    if (i >= 0) return { found: true, span: { start: i, end: i + cand.length }, needle: cand };
  }
  return { found: false, span: null, needle: candidates(ev)[0] ?? null };
}

/** Split printed content into [before, match, after] for rendering a highlight. */
export function splitForHighlight(content: string, span: HighlightSpan | null): [string, string, string] {
  if (!span) return [content, "", ""];
  return [content.slice(0, span.start), content.slice(span.start, span.end), content.slice(span.end)];
}
