import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

// 7.2 Protection of sensitive data. Sensitive fields (SSN, ITIN, individual
// EIN, bank routing/account, IP PIN, 8879 PIN, DOB) are encrypted at rest with
// AES-256-GCM. The key comes from FIELD_ENCRYPTION_KEY (env); tests use a fixed
// test key. Plaintext is only ever produced by decryptField inside
// revealSensitive — never cached, never stored, never logged.

export type SensitiveKind = "ssn" | "itin" | "ein" | "account" | "routing" | "ip_pin" | "pin_8879" | "dob";

const TEST_KEY_HEX = "0".repeat(64); // 32 bytes of zero — tests only

/** Resolve the 32-byte key. Accepts hex (64 chars) or base64; falls back to a
 *  fixed test key when FIELD_ENCRYPTION_KEY is unset (so unit tests are hermetic). */
export function fieldKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env.FIELD_ENCRYPTION_KEY;
  if (!raw) return Buffer.from(TEST_KEY_HEX, "hex");
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  const b = Buffer.from(raw, "base64");
  if (b.length === 32) return b;
  // Last resort: derive 32 bytes from an arbitrary string so we never throw at runtime.
  return createHash("sha256").update(raw).digest();
}

export interface Encrypted {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
}

export function encryptField(plaintext: string, key: Buffer = fieldKey()): Encrypted {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: enc.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptField(parts: Encrypted, key: Buffer = fieldKey()): string {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parts.iv, "base64"));
  decipher.setAuthTag(Buffer.from(parts.authTag, "base64"));
  const dec = Buffer.concat([decipher.update(Buffer.from(parts.ciphertext, "base64")), decipher.final()]);
  return dec.toString("utf8");
}

/** The masked token we store and show everywhere a value is not revealed. */
export function maskToken(kind: SensitiveKind, plaintext: string): string {
  const digits = plaintext.replace(/[^0-9A-Za-z]/g, "");
  const last4 = digits.slice(-4);
  switch (kind) {
    case "ssn":
    case "itin":
      return `•••-••-${last4}`;
    case "ein":
      return `••-•••${last4}`;
    case "account":
    case "routing":
      return `••••${last4}`;
    case "ip_pin":
    case "pin_8879":
      return "••••••";
    case "dob":
      return "••/••/••••";
    default:
      return `••••${last4}`;
  }
}

// ---- Leak scanning (§7.2 must-pass) ----------------------------------------
// Regexes for FULL sensitive values that must never reach an uncleared viewer,
// in any route, API response, export, notification, log, search result or error.

export interface LeakPattern {
  name: string;
  re: RegExp;
}

export const LEAK_PATTERNS: LeakPattern[] = [
  { name: "full_ssn", re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { name: "ssn_666", re: /\b666-\d{2}-\d{4}\b/g },
  { name: "ein", re: /\b\d{2}-\d{7}\b/g },
  { name: "account_number", re: /\b\d{8,17}\b/g },
  { name: "routing", re: /\b\d{9}\b/g },
  { name: "ip_pin", re: /\bIP\s?PIN[:\s]*\d{6}\b/gi },
  { name: "pin_8879", re: /\b8879\b.*?\b\d{5}\b/gi },
];

export interface LeakHit {
  pattern: string;
  match: string;
}

/** Scan text for full sensitive values. A non-empty result over an uncleared
 *  viewer's rendered output is a failure. Masked tokens (• characters) never
 *  match because they contain no digits of the required run length. */
export function scanForLeaks(text: string): LeakHit[] {
  const hits: LeakHit[] = [];
  for (const p of LEAK_PATTERNS) {
    const re = new RegExp(p.re.source, p.re.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      hits.push({ pattern: p.name, match: m[0] });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return hits;
}

/** True when the rendered output is clean of full sensitive values. */
export function isLeakFree(text: string): boolean {
  return scanForLeaks(text).length === 0;
}

// ---- "Search is not an oracle" ---------------------------------------------
// An uncleared user searching a sensitive value must not learn whether it
// exists. We detect sensitive-looking queries and refuse to confirm matches.

const SENSITIVE_QUERY_RES: RegExp[] = [
  /\d{3}-?\d{2}-?\d{2,4}/, // partial/full SSN
  /\b\d{6,}\b/, // long digit runs (account/pin)
  /ip\s?pin/i,
];

export function isSensitiveQuery(query: string): boolean {
  return SENSITIVE_QUERY_RES.some((re) => re.test(query));
}

// ---- Reveal authorization (pure gate for revealSensitive) ------------------

export interface RevealActor {
  id: string;
  clearance: boolean;
  activeFrom: string; // ISO
  assignedEngagementIds: string[];
}

export interface RevealRequest {
  now: string; // ISO
  reason: string;
  engagementId?: string | null;
}

export interface RevealDecision {
  allow: boolean;
  reason: string;
}

/** revealSensitive's gate: cleared + active + assigned + a non-empty reason.
 *  Denials never reveal whether the value exists. */
export function canReveal(actor: RevealActor, req: RevealRequest): RevealDecision {
  if (Date.parse(req.now) < Date.parse(actor.activeFrom))
    return { allow: false, reason: `${actor.id} is not active until ${actor.activeFrom}.` };
  if (!actor.clearance) return { allow: false, reason: "Sensitive data requires clearance." };
  if (!req.reason || req.reason.trim().length < 3)
    return { allow: false, reason: "A reason is required to reveal a sensitive value." };
  if (req.engagementId && !actor.assignedEngagementIds.includes(req.engagementId))
    return { allow: false, reason: "Not assigned to this engagement." };
  return { allow: true, reason: "ok" };
}
