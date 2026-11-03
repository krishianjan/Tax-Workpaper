import { describe, it, expect } from "vitest";
import { loadModel } from "@/lib/packet/load";
import { verifyAll, verifyValue } from "@/lib/evidence/verify";
import { computeDispositions, dispositionSummary } from "@/lib/evidence/disposition";
import { computeDocumentLinks } from "@/lib/evidence/links";
import { buildRecipe, whereDocLanded } from "@/lib/evidence/trace";
import { collectAllRefs, resolveRef } from "@/lib/refs/resolve";

// Golden tests run the real packet and assert the Feature 1 "must find" rows.
const model = loadModel();

describe("integrity counts", () => {
  it("has the expected shape", () => {
    expect(model.documents.length).toBe(74);
    expect(model.raw.extracted_values.length).toBe(3012);
    expect(model.versions.length).toBe(3);
  });

  it("every extracted value points at a real document and page", () => {
    for (const ev of model.raw.extracted_values) {
      const doc = model.docById.get(ev.document_id);
      expect(doc, ev.id).toBeTruthy();
      if (ev.page != null) {
        expect(doc!.pages.some((p) => p.page === ev.page), `${ev.id} page ${ev.page}`).toBe(true);
      }
    }
  });

  it("page_count matches pages.length for every document", () => {
    for (const d of model.documents) expect(d.pages.length, d.id).toBe(d.page_count);
  });
});

describe("reference integrity", () => {
  it("resolves all references except documented doc-page pointers", () => {
    const refs = collectAllRefs(model);
    const unresolved = refs
      .map((r) => ({ ...r, res: resolveRef(model, r.raw, r.versionId) }))
      .filter((r) => !r.res.resolved);
    // Any unresolved refs must be the doc:<id>#page<n> kind (unextracted pages).
    for (const u of unresolved) {
      expect(u.res.kind, `${u.raw} @ ${u.where}`).toBe("doc_page");
    }
  });
});

describe("verification (value vs print)", () => {
  it("D62 EIN read 74-3829516 mismatches the printed 74-3829156", () => {
    const ev = model.evById.get("ev-1045")!;
    expect(ev.value).toBe("74-3829516");
    expect(verifyValue(model, ev).status).toBe("mismatch_with_source");
  });

  it("D64 handwritten amount at 0.41 needs a human", () => {
    const ev = model.evById.get("ev-1049")!;
    expect(ev.confidence).toBeLessThan(0.6);
    expect(verifyValue(model, ev).status).toBe("needs_human");
  });

  it("produces a verification for every extracted value", () => {
    expect(verifyAll(model).length).toBe(3012);
  });
});

describe("document links", () => {
  const links = computeDocumentLinks(model);

  it("D10 is a duplicate of D09", () => {
    expect(links.some((l) => l.kind === "duplicate_of" && l.fromDocId === "D10" && l.toDocId === "D09")).toBe(true);
  });

  it("D31 supersedes D30 (issuer CORRECTED) with a field diff", () => {
    const l = links.find((x) => x.kind === "supersedes" && x.fromDocId === "D31" && x.toDocId === "D30");
    expect(l).toBeTruthy();
    expect(Array.isArray((l!.basis as { diff: unknown[] }).diff)).toBe(true);
  });
});

describe("dispositions — 74/74 accounted", () => {
  const disp = computeDispositions(model);

  it("accounts for every document (none unaccounted)", () => {
    const s = dispositionSummary(disp);
    expect(s.total).toBe(74);
    expect(s.accounted).toBe(74);
    expect(disp.every((d) => d.status !== "unaccounted")).toBe(true);
  });

  it("D30 superseded; D71 and D72 received after the return", () => {
    const by = new Map(disp.map((d) => [d.documentId, d]));
    expect(by.get("D30")!.status).toBe("superseded");
    expect(by.get("D71")!.status).toBe("received_after_return");
    expect(by.get("D72")!.status).toBe("received_after_return");
  });
});

describe("trace", () => {
  it("F1040.1a recipe cites ev-0016 and ev-0035, counts D10 once (212,400)", () => {
    const node = buildRecipe(model, "v3", "F1040.1a")!;
    expect(node.value).toBe(212400);
    const srcIds = node.sources.map((s) => s.raw);
    expect(srcIds).toContain("ev-0016");
    expect(srcIds).toContain("ev-0035");
    expect(srcIds).not.toContain("ev-0036");
  });

  it("D09 lands on the wages line", () => {
    const landed = whereDocLanded(model, "D09");
    expect(landed.some((l) => l.key === "F1040.1a")).toBe(true);
  });
});
