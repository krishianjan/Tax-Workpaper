import { describe, it, expect } from "vitest";
import { loadModel } from "@/lib/packet/load";
import { runChecks, ALL_CHECKS } from "@/lib/checks/runner";
import type { CheckResult } from "@/lib/checks/types";

const model = loadModel();
const ctx = { model, versionId: "v3" };
const findings = runChecks(ctx);
const by = (checkId: string) => findings.filter((f) => f.checkId === checkId);
const has = (f: CheckResult[], pred: (r: CheckResult) => boolean) => f.some(pred);

describe("VALUE_VS_PRINT", () => {
  const f = by("VALUE_VS_PRINT");
  it("D62 EIN read 74-3829516 vs printed 74-3829156", () => {
    expect(has(f, (r) => r.refs.includes("ev-1045") && r.status === "fail")).toBe(true);
  });
  it("D28 N1/N3/N4 basis not reported read as 0 (not_printed)", () => {
    for (const ev of ["ev-0498", "ev-0516", "ev-0525"]) {
      expect(has(f, (r) => r.refs.includes(ev)), ev).toBe(true);
    }
  });
});

describe("DUPLICATE_DOCUMENT", () => {
  it("D10 = D09, counted once", () => {
    expect(has(by("DUPLICATE_DOCUMENT"), (r) => r.refs.includes("D10") && r.refs.includes("D09"))).toBe(true);
  });
});

describe("DUPLICATE_PAGE", () => {
  const f = by("DUPLICATE_PAGE");
  it("D23 page 3 = page 2", () => {
    expect(has(f, (r) => r.title.includes("D23") && r.title.includes("page 3"))).toBe(true);
  });
  it("business miles unique 8,100 (engine 11,800)", () => {
    expect(has(f, (r) => r.refs.includes("SchC.44a") && r.expected === 8100 && r.actual === 11800)).toBe(true);
  });
  it("SchC.9 car expense recomputed 5,670 from 8,260 (delta -2,590)", () => {
    const sch9 = f.find((r) => r.refs.includes("SchC.9") && r.delta != null);
    expect(sch9).toBeTruthy();
    expect(sch9!.delta).toBe(-259000n);
  });
});

describe("PARTIAL_EXTRACTION", () => {
  it("D31 page 32 Ironwood REIT proceeds 250", () => {
    const f = by("PARTIAL_EXTRACTION");
    expect(has(f, (r) => r.refs.includes("D31") && r.delta === 25000n)).toBe(true);
  });
});

describe("BROKER_SUMMARY_VS_DETAIL", () => {
  it("D31 71,965 vs 71,715, gap 250", () => {
    const f = by("BROKER_SUMMARY_VS_DETAIL");
    expect(has(f, (r) => r.refs.includes("D31") && r.delta === 25000n)).toBe(true);
  });
});

describe("MISSING_OR_ZERO_BASIS", () => {
  const f = by("MISSING_OR_ZERO_BASIS");
  it("N1/N3/N4 overstated gain totals 47,620", () => {
    const matched = f.filter((r) => r.status === "fail" && r.delta != null);
    const total = matched.reduce((s, r) => s + (r.delta! < 0n ? -r.delta! : r.delta!), 0n);
    expect(total).toBe(4762000n);
  });
  it("Coinhaven C6 found (zero basis, transferred in)", () => {
    expect(has(f, (r) => r.refs.some((x) => x.includes("C6")))).toBe(true);
  });
});

describe("THIRD_PARTY_VS_BOOKS", () => {
  it("SchC.1 overstated by 12,400 (books 151,300)", () => {
    const f = by("THIRD_PARTY_VS_BOOKS");
    expect(has(f, (r) => r.refs.includes("SchC.1") && r.delta === -1240000n)).toBe(true);
  });
});

describe("PAYMENTS_VS_AGENCY", () => {
  const f = by("PAYMENTS_VS_AGENCY");
  it("Federal 13,000 -> 12,000 (delta -1,000)", () => {
    expect(has(f, (r) => r.refs.includes("F1040.26") && r.delta === -100000n)).toBe(true);
  });
  it("California 14,000 -> 10,500 (delta -3,500)", () => {
    expect(has(f, (r) => r.refs.includes("F540NR.72") && r.delta === -350000n)).toBe(true);
  });
});

describe("STATE_SOURCE_WAGES", () => {
  it("flags all-CA wages as a judgment call", () => {
    const f = by("STATE_SOURCE_WAGES");
    expect(has(f, (r) => r.refs.includes("SchCA540NR.1.E") && r.judgment === true)).toBe(true);
  });
});

describe("QUESTIONNAIRE_VS_DOCS", () => {
  it("qa-14 'no investments sold' conflicts with the sales", () => {
    expect(has(by("QUESTIONNAIRE_VS_DOCS"), (r) => r.refs.includes("qa-14"))).toBe(true);
  });
});

describe("IDENTITY_CONSISTENCY", () => {
  it("Theo SSN differs from the 2024 return", () => {
    const f = by("IDENTITY_CONSISTENCY");
    expect(has(f, (r) => r.title.includes("Theo") && r.status === "fail")).toBe(true);
  });
});

describe("PRIOR_YEAR_VARIANCE", () => {
  const f = by("PRIOR_YEAR_VARIANCE");
  it("AGI 228,409 -> 445,590 flagged", () => {
    expect(has(f, (r) => r.refs.includes("F1040.11") && r.status === "warn")).toBe(true);
  });
  it("lists unmatched prior-year lines (CA540.* and F1040.34)", () => {
    expect(has(f, (r) => r.refs.includes("F1040.34"))).toBe(true);
    expect(has(f, (r) => r.refs.some((x) => x.startsWith("CA540")))).toBe(true);
  });
});

describe("PAYEE_NAME_CONSISTENCY", () => {
  it("Bright Oak provider name mismatch (same EIN)", () => {
    const f = by("PAYEE_NAME_CONSISTENCY");
    expect(has(f, (r) => r.refs.includes("F2441.1a"))).toBe(true);
  });
});

describe("ENGINE_DIAGNOSTICS", () => {
  it("imports 11 v3 diagnostics", () => {
    expect(by("ENGINE_DIAGNOSTICS").length).toBe(11);
  });
});

describe("CROSS_FORM_DUPLICATE_INCOME", () => {
  const f = by("CROSS_FORM_DUPLICATE_INCOME");
  it("D28/D29 sweep interest 1,840 counted twice (SchB.1.1 + SchB.1.2)", () => {
    const r = f.find((x) => x.status === "fail");
    expect(r).toBeTruthy();
    expect(r!.refs).toContain("D28");
    expect(r!.refs).toContain("D29");
    expect(r!.refs).toContain("SchB.1.1");
    expect(r!.refs).toContain("SchB.1.2");
  });
  it("tax effect fed −640.32, CA −126.96 (interest rates)", () => {
    const r = f.find((x) => x.status === "fail")!;
    expect(r.delta).toBe(-184000n);
    expect(r.taxEffectFed).toBe(-64032n);
    expect(r.taxEffectCa).toBe(-12696n);
  });
  it("is NOT caught by DUPLICATE_DOCUMENT (different issuers/forms)", () => {
    // DUPLICATE_DOCUMENT never links D28 and D29.
    expect(has(by("DUPLICATE_DOCUMENT"), (r) => r.refs.includes("D28") && r.refs.includes("D29"))).toBe(false);
  });
});

describe("FX_RATE_PERIOD", () => {
  const f = by("FX_RATE_PERIOD");
  it("SchB.1.6 Sparbanken interest used 2024 average, should be 2025 (Δ +124)", () => {
    const r = f.find((x) => x.refs.includes("SchB.1.6") && x.status === "fail");
    expect(r).toBeTruthy();
    expect(r!.delta).toBe(12400n);
    expect(r!.taxEffectFed).toBe(4315n);
    expect(r!.taxEffectCa).toBe(856n);
  });
  it("F8938 lines pass (year-end rate is correct for a balance)", () => {
    const passes = f.filter((x) => x.status === "pass" && x.refs.some((r) => r.startsWith("F8938")));
    expect(passes.length).toBeGreaterThanOrEqual(1);
  });
});

describe("NONDEDUCTIBLE_CONTRIBUTION", () => {
  it("SEP 2,786 nondeductible raised as compliance (no return tax effect)", () => {
    const r = by("NONDEDUCTIBLE_CONTRIBUTION").find((x) => x.refs.includes("D26"));
    expect(r).toBeTruthy();
    expect(r!.judgment).toBe(true);
    expect(r!.taxEffectFed).toBe(0n);
    expect(r!.title).toContain("2,786");
  });
});

describe("BASIS_GAP", () => {
  const f = by("BASIS_GAP");
  it("Ridgeline (D37) outside basis never computed", () => {
    expect(has(f, (r) => r.refs.includes("D37"))).toBe(true);
  });
  it("S corp (D40) ending stock basis missing for 2023 and 2024", () => {
    const scorp = f.filter((r) => r.refs.includes("D40"));
    expect(scorp.length).toBeGreaterThanOrEqual(2);
  });
});

describe("EXPENSE_CLASSIFICATION_NOTE", () => {
  it("SchE.14A HVAC 11,000 inside repairs links to the HVAC decision", () => {
    const r = by("EXPENSE_CLASSIFICATION_NOTE").find((x) => x.refs.includes("SchE.14A"));
    expect(r).toBeTruthy();
    expect(r!.refs).toContain("decision:hvac");
    expect(r!.judgment).toBe(true);
  });
});

describe("stable + idempotent", () => {
  it("every finding has a 16-hex stable id", () => {
    for (const r of findings) expect(r.id, r.checkId).toMatch(/^[0-9a-f]{16}$|^error-/);
  });
  it("re-running produces the same finding ids", () => {
    const again = runChecks(ctx);
    expect(new Set(again.map((r) => r.id))).toEqual(new Set(findings.map((r) => r.id)));
    expect(again.length).toBe(findings.length);
  });
  it("runs all 25 checks", () => {
    expect(ALL_CHECKS.length).toBe(25);
  });
});
