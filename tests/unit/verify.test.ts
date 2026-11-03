import { describe, it, expect } from "vitest";
import { verifyValue } from "@/lib/evidence/verify";
import { buildModel } from "@/lib/packet/model";
import type { Packet } from "@/lib/packet/schema";

function miniModel(docPrinted: string, ev: Record<string, unknown>) {
  const raw = {
    packet: { name: "t", version: "1", generated: "2026-01-01", client_id: "x" },
    readme: {},
    household: {},
    documents: [
      {
        id: "D01",
        title: "Test",
        document_type: "W-2",
        page_count: 1,
        pages: [{ page: 1, printed_content: docPrinted }],
        extraction: { status: "extracted" },
      },
    ],
    extracted_values: [{ page: 1, text_as_read: "", label: null, position: null, ...ev }],
    client: {},
    firm: { staff: [], client_users: [], starter_standards: {} },
    prior_years: {},
    tax_agency_records: {},
    timeline: [],
    engine_reference: {},
    return_versions: [],
  } as unknown as Packet;
  return buildModel(raw, "sha");
}

describe("verify (ground truth = printed_content)", () => {
  it("agrees when the value is printed", () => {
    const m = miniModel("Box 1 Wages 107,800.00", {
      id: "ev-1",
      document_id: "D01",
      field: "box1",
      value: 107800,
      value_type: "money",
      text_as_read: "107,800.00",
      confidence: 0.99,
    });
    expect(verifyValue(m, m.evById.get("ev-1")!).status).toBe("agreed_to_source");
  });

  it("flags a high-confidence EIN that disagrees with the page (D62 case)", () => {
    const m = miniModel("Tax ID 74-3829156. After-school care.", {
      id: "ev-2",
      document_id: "D01",
      field: "ein",
      value: "74-3829516",
      value_type: "ein",
      text_as_read: "74-3829516",
      confidence: 0.97,
    });
    expect(verifyValue(m, m.evById.get("ev-2")!).status).toBe("mismatch_with_source");
  });

  it("needs a human on low confidence even if it matches (D64 case)", () => {
    const m = miniModel("Donation amount 1,500.00", {
      id: "ev-3",
      document_id: "D01",
      field: "amount",
      value: 1500,
      value_type: "money",
      text_as_read: "1,500.00",
      confidence: 0.41,
    });
    expect(verifyValue(m, m.evById.get("ev-3")!).status).toBe("needs_human");
  });

  it("treats blank/not-reported as not_printed, never zero", () => {
    const blank = miniModel("Cost basis (not reported)", {
      id: "ev-4",
      document_id: "D01",
      field: "basis",
      value: 0,
      value_type: "money",
      text_as_read: "",
      confidence: 0.9,
    });
    expect(verifyValue(blank, blank.evById.get("ev-4")!).status).toBe("not_printed");

    const marked = miniModel("Cost basis (not reported)", {
      id: "ev-5",
      document_id: "D01",
      field: "basis",
      value: 0,
      value_type: "money",
      text_as_read: "(not reported)",
      confidence: 0.9,
    });
    expect(verifyValue(marked, marked.evById.get("ev-5")!).status).toBe("not_printed");
  });
});
