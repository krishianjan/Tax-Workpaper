import type { Check, CheckResult } from "./types";
import { makeFinding } from "./types";
import { verifyValue } from "../evidence/verify";

// Summarizes §5.4 verification into findings. Ground truth is printed_content.
// We raise meaningful identifier/money/date mismatches and money fields that
// were not printed (read as 0). Golden: D62 EIN mismatch; D28 basis not printed.

const MEANINGFUL = new Set(["money", "ein", "ssn", "account_number", "date", "percent", "integer", "quantity"]);

export const valueVsPrint: Check = {
  id: "VALUE_VS_PRINT",
  title: "Extracted values vs what the page prints",
  area: "Evidence",
  secondSource: "page_text",
  run({ model }): CheckResult[] {
    const out: CheckResult[] = [];
    for (const ev of model.raw.extracted_values) {
      const v = verifyValue(model, ev);
      if (v.status === "mismatch_with_source" && MEANINGFUL.has(ev.value_type)) {
        out.push(
          makeFinding({
            checkId: this.id,
            title: `${ev.document_id}: ${ev.label ?? ev.field} read differently from the page`,
            area: this.area,
            secondSource: this.secondSource,
            status: ["money", "ein", "ssn", "account_number"].includes(ev.value_type) ? "fail" : "warn",
            expected: "see printed page",
            actual: String(ev.value),
            delta: null,
            refs: [ev.id, ev.document_id],
            primaryRefs: [ev.id],
            explanation: `Read "${ev.value}" at confidence ${ev.confidence}, but the page as printed does not contain it. Human review required.`,
          }),
        );
      } else if (v.status === "not_printed" && ev.value_type === "money") {
        out.push(
          makeFinding({
            checkId: this.id,
            title: `${ev.document_id}: ${ev.label ?? ev.field} not printed — stored as missing, not 0`,
            area: this.area,
            secondSource: this.secondSource,
            status: "warn",
            expected: "a printed amount",
            actual: "(not printed)",
            delta: null,
            refs: [ev.id, ev.document_id],
            primaryRefs: [ev.id],
            explanation: "A blank or '(not reported)' money field is treated as missing, never silently 0.",
          }),
        );
      }
    }
    return out;
  },
};
