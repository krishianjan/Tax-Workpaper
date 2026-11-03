import { describe, it, expect } from "vitest";
import { toCents, parseMoneyString, formatCents, formatDollars } from "@/lib/money";

describe("money", () => {
  it("parses numbers (dollars) to cents", () => {
    expect(toCents(4800)).toBe(480000n);
    expect(toCents(4800.0)).toBe(480000n);
    expect(toCents(71965.0)).toBe(7196500n);
    expect(toCents(310.0)).toBe(31000n);
  });

  it("avoids float drift", () => {
    expect(toCents(0.1 + 0.2)).toBe(30n); // 0.30
    expect(toCents(5325.0)).toBe(532500n);
  });

  it("parses printed money strings", () => {
    expect(parseMoneyString("4,800.00")).toBe(480000n);
    expect(parseMoneyString("$71,965.00")).toBe(7196500n);
    expect(parseMoneyString("250.00")).toBe(25000n);
    expect(parseMoneyString("(1,234.00)")).toBe(-123400n);
  });

  it("returns null for non-money", () => {
    expect(parseMoneyString("(not reported)")).toBeNull();
    expect(parseMoneyString("")).toBeNull();
    expect(toCents(null)).toBeNull();
  });

  it("formats", () => {
    expect(formatCents(7196500n)).toBe("$71,965.00");
    expect(formatCents(-123400n)).toBe("-$1,234.00");
    expect(formatDollars(21240000n)).toBe("$212,400");
    expect(formatCents(null)).toBe("—");
  });
});
