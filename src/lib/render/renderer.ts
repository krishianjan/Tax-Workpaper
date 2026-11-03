import type { PacketModel } from "../packet/model";
import type { PacketExtractedValue, ValueType } from "../packet/schema";
import { maskPrintedContent, maskValue } from "../mask";

// DocumentRenderer: a replaceable interface. SimulatedRenderer renders
// printed_content as a styled paper page. A PdfRenderer stub has the same shape
// so real PDFs drop in without touching callers. Deep-link URLs
// (/doc/D09/p/1#ev-0035) stay identical when real PDFs arrive.

export type Anchor =
  | { kind: "text"; start: number; end: number }
  | { kind: "bbox"; x0: number; y0: number; x1: number; y1: number };

export type TemplateKind =
  | "w2"
  | "consolidated_1099"
  | "1099_nec_k"
  | "k1"
  | "1098"
  | "receipt_note"
  | "letter";

export interface RenderedField {
  evId: string;
  field: string;
  label: string;
  value: string;
  valueType: ValueType;
  confidence: number;
}

export interface RenderedPage {
  docId: string;
  pageNo: number;
  issuer: string;
  formTitle: string;
  documentType: string;
  template: TemplateKind;
  simulatedLabel: string;
  printedContent: string; // masked per viewer
  fields: RenderedField[];
  renderKind: "simulated" | "pdf";
}

export function templateFor(documentType: string): TemplateKind {
  const t = documentType.toLowerCase();
  if (t === "w-2") return "w2";
  if (t === "1099-composite" || t.includes("composite") || t === "1099-b") return "consolidated_1099";
  if (t === "1099-nec" || t === "1099-k" || t === "1099-da" || t === "1099-int") return "1099_nec_k";
  if (t.startsWith("k-1")) return "k1";
  if (t === "1098" || t === "1098-t" || t === "1098-c") return "1098";
  if (t === "donation_receipt" || t === "client_note" || t === "mileage_log" || t === "invoice") return "receipt_note";
  return "letter";
}

export interface DocumentRenderer {
  renderPage(docId: string, pageNo: number, cleared: boolean): RenderedPage | null;
  locate(evId: string): Anchor | null;
}

export class SimulatedRenderer implements DocumentRenderer {
  constructor(private model: PacketModel) {}

  renderPage(docId: string, pageNo: number, cleared: boolean): RenderedPage | null {
    const doc = this.model.docById.get(docId);
    if (!doc) return null;
    const page = doc.pages.find((p) => p.page === pageNo);
    if (!page) return null;

    const fields: RenderedField[] = (this.model.evsByDoc.get(docId) ?? [])
      .filter((e) => (e.page ?? 1) === pageNo)
      .map((e) => ({
        evId: e.id,
        field: e.field,
        label: e.label ?? e.field,
        value: maskValue(e.value, e.value_type, cleared),
        valueType: e.value_type,
        confidence: e.confidence,
      }));

    return {
      docId,
      pageNo,
      issuer: doc.issuer ?? "Unknown issuer",
      formTitle: doc.title,
      documentType: doc.document_type,
      template: templateFor(doc.document_type),
      simulatedLabel: "Simulated from extracted packet",
      printedContent: maskPrintedContent(page.printed_content, cleared),
      fields,
      renderKind: "simulated",
    };
  }

  locate(evId: string): Anchor | null {
    const ev = this.model.evById.get(evId);
    if (!ev) return null;
    const doc = this.model.docById.get(ev.document_id);
    const page = doc?.pages.find((p) => p.page === (ev.page ?? 1));
    if (!page) return null;
    // Prefer a text anchor computed from printed content; bbox is PDF-only.
    const needle = ev.text_as_read || (typeof ev.value === "string" ? ev.value : String(ev.value));
    const i = page.printed_content.toLowerCase().indexOf(needle.toLowerCase());
    if (i >= 0) return { kind: "text", start: i, end: i + needle.length };
    return null;
  }
}

/** PDF renderer stub — same interface; uses synthetic bbox positions. */
export class PdfRenderer implements DocumentRenderer {
  constructor(private model: PacketModel) {}

  renderPage(): RenderedPage | null {
    // Real PDF rendering arrives with real files. The interface is identical to
    // SimulatedRenderer so callers do not change.
    return null;
  }

  locate(evId: string): Anchor | null {
    const ev = this.model.evById.get(evId);
    if (!ev?.position) return null;
    const { x0, y0, x1, y1 } = ev.position;
    return { kind: "bbox", x0, y0, x1, y1 };
  }
}
