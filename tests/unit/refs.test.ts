import { describe, it, expect } from "vitest";
import { parseRef, resolveJsonPointer, resolveRef } from "@/lib/refs/resolve";
import { loadModel } from "@/lib/packet/load";

describe("ref parser", () => {
  it("classifies every ref kind", () => {
    expect(parseRef("ev-0035").kind).toBe("extracted_value");
    expect(parseRef("D09").kind).toBe("document");
    expect(parseRef("doc:D30#page32").kind).toBe("doc_page");
    expect(parseRef("qa-41").kind).toBe("client_item");
    expect(parseRef("msg-02").kind).toBe("client_item");
    expect(parseRef("call-01").kind).toBe("client_item");
    expect(parseRef("py:/carryovers_into_2025/capital_loss_short").kind).toBe("prior_year");
    expect(parseRef("agency:/irs_account_transcript_2025/0").kind).toBe("agency");
    expect(parseRef("asset:RENTAL-1").kind).toBe("asset");
    expect(parseRef("household:theo").kind).toBe("household");
    expect(parseRef("ref:param.standard_deduction_mfj").kind).toBe("param");
    expect(parseRef("ref:fx.SEK.year_avg").kind).toBe("fx");
    expect(parseRef("timeline:extension-2026-04-14").kind).toBe("timeline");
    expect(parseRef("F1040.1a").kind).toBe("line");
    expect(parseRef("SchCA540NR.1.E").kind).toBe("line");
  });
});

describe("json pointer (RFC 6901)", () => {
  it("resolves nested tokens and escapes", () => {
    const root = { a: { "b/c": [10, 20], "d~e": 5 } };
    expect(resolveJsonPointer(root, "/a/b~1c/1")).toBe(20);
    expect(resolveJsonPointer(root, "/a/d~0e")).toBe(5);
    expect(resolveJsonPointer(root, "/a/missing")).toBeUndefined();
    expect(resolveJsonPointer(root, "")).toBe(root);
  });
});

describe("ref resolver (real packet)", () => {
  const model = loadModel();

  it("resolves core refs", () => {
    expect(resolveRef(model, "ev-0035").resolved).toBe(true);
    expect(resolveRef(model, "D09").resolved).toBe(true);
    expect(resolveRef(model, "qa-41").resolved).toBe(true);
    expect(resolveRef(model, "timeline:extension-2026-04-14").resolved).toBe(true);
    expect(resolveRef(model, "py:/carryovers_into_2025/capital_loss_short").resolved).toBe(true);
    expect(resolveRef(model, "household:theo").resolved).toBe(true);
  });

  it("resolves a line ref only within its version", () => {
    expect(resolveRef(model, "F1040.1a", "v3").resolved).toBe(true);
    expect(resolveRef(model, "F1040.1a").resolved).toBe(false); // no version context
  });

  it("reports (never throws) on a bad pointer", () => {
    const r = resolveRef(model, "py:/nope/~1bad");
    expect(r.resolved).toBe(false);
    expect(r.error).toBeTruthy();
  });
});
