// Money is integer cents everywhere in our code. Never floats.
// The packet gives money as JSON numbers (whole dollars on lines, cents on 8949 lots)
// or as strings in printed_content ("4,800.00"). Convert once, here.

export type Cents = bigint;

/** Parse a money value that may be a number (dollars) or a printed string. */
export function toCents(value: unknown): Cents | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    // Round to nearest cent to avoid binary float drift (e.g. 4800.00 * 100).
    return BigInt(Math.round(value * 100));
  }
  if (typeof value === "bigint") return value * 100n;
  if (typeof value === "string") return parseMoneyString(value);
  return null;
}

/** Parse "$71,965.00", "71965", "(not reported)" → cents or null. */
export function parseMoneyString(raw: string): Cents | null {
  const s = raw.trim();
  if (s === "") return null;
  // A negative in accounting parentheses: (1,234.00)
  const negParen = /^\(.*\)$/.test(s);
  const cleaned = s.replace(/[()$,\s]/g, "");
  if (cleaned === "" || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const neg = negParen || cleaned.startsWith("-");
  const num = cleaned.replace(/^-/, "");
  const [whole, frac = ""] = num.split(".");
  const cents = BigInt(whole) * 100n + BigInt((frac + "00").slice(0, 2).padEnd(2, "0"));
  return neg ? -cents : cents;
}

export function formatCents(c: Cents | null): string {
  if (c === null) return "—";
  const neg = c < 0n;
  const abs = neg ? -c : c;
  const dollars = abs / 100n;
  const rem = abs % 100n;
  const withCommas = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = `${withCommas}.${rem.toString().padStart(2, "0")}`;
  return neg ? `-$${body}` : `$${body}`;
}

/** Whole-dollar display used on return lines. */
export function formatDollars(c: Cents | null): string {
  if (c === null) return "—";
  const neg = c < 0n;
  const abs = neg ? -c : c;
  const dollars = abs / 100n;
  const withCommas = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return neg ? `-$${withCommas}` : `$${withCommas}`;
}
