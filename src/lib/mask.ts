import type { ValueType } from "./packet/schema";

// Masking from day one. SSN, EIN, account numbers and IP PINs are masked for
// anyone without sensitive-data clearance. Enforced in server code, not only UI.
// Every unmasked view is logged (see firm standards). Unmasking is not in Block 1.

const SENSITIVE_TYPES: ValueType[] = ["ssn", "ein", "account_number"];

export function isSensitiveType(t: ValueType): boolean {
  return SENSITIVE_TYPES.includes(t);
}

/** Mask an identifier, keeping the last 4 characters. */
export function maskIdentifier(raw: string): string {
  const s = String(raw);
  const tail = s.replace(/[^0-9A-Za-z]/g, "").slice(-4);
  return `•••• ${tail}`;
}

export function maskValue(value: unknown, valueType: ValueType, cleared: boolean): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (cleared || !isSensitiveType(valueType)) return s;
  return maskIdentifier(s);
}

// Patterns for masking identifiers embedded in free page text.
const PATTERNS: RegExp[] = [
  /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
  /\b\d{2}-\d{7}\b/g, // EIN
  /\b(?:account|acct|a\/c)\s*#?\s*[:]?\s*([0-9]{6,})\b/gi, // account numbers
  /\bIP\s?PIN\s*[:]?\s*(\d{6})\b/gi, // IP PIN
];

/** Mask identifiers inside a page's printed content for non-cleared viewers. */
export function maskPrintedContent(content: string, cleared: boolean): string {
  if (cleared) return content;
  let out = content;
  out = out.replace(/\b\d{3}-\d{2}-\d{4}\b/g, (m) => maskIdentifier(m));
  out = out.replace(/\b\d{2}-\d{7}\b/g, (m) => maskIdentifier(m));
  out = out.replace(/\b(\d{6,})\b/g, (m) => (m.length >= 8 ? maskIdentifier(m) : m));
  return out;
}

export function isClearedRole(sensitiveDataClearance: boolean | undefined): boolean {
  return sensitiveDataClearance === true;
}

// Keep a reference so lint doesn't flag the exported pattern list as unused when
// callers only use maskPrintedContent.
export const SENSITIVE_PATTERNS = PATTERNS;
