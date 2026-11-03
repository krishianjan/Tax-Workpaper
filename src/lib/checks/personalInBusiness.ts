import type { Check, CheckResult } from "./types";
import { makeFinding } from "./types";
import { line, lineValueCents } from "./helpers";
import { toCents, formatCents } from "../money";
import { taxEffects } from "../effects";

// A call note identifies a personal item booked to the business. call-01:
// "Spotify Family in software is personal - booked by mistake." D15 p1 shows
// Spotify 216 inside Software and subscriptions 6,850 (SchC.27a.1). Judgment
// (client statement) — suggested removal of 216.

function detailText(model: import("../packet/model").PacketModel, docType: string): { text: string; docId: string | null } {
  const doc = model.documents.find((d) => d.document_type === docType);
  return { text: doc ? doc.pages.map((p) => p.printed_content).join("\n") : "", docId: doc?.id ?? null };
}

export const personalInBusiness: Check = {
  id: "PERSONAL_IN_BUSINESS",
  title: "Personal expense booked to the business",
  area: "Schedule C",
  secondSource: "client_answer",
  run({ model, versionId }): CheckResult[] {
    const out: CheckResult[] = [];
    const calls = (model.raw.client as Record<string, unknown>).call_notes;
    if (!Array.isArray(calls)) return out;

    // Extract named personal items from the call note.
    const flat = calls.flatMap((c) => {
      const notes = (c as Record<string, unknown>).notes;
      return Array.isArray(notes) ? notes.map(String) : [];
    });
    const personalItems = flat
      .filter((n) => /personal/i.test(n))
      .map((n) => n.match(/^([A-Z][\w &]+?)\s+(?:in|is)\b/)?.[1]?.trim())
      .filter((x): x is string => Boolean(x));
    if (personalItems.length === 0) return out;

    const detail = detailText(model, "books_transaction_detail");
    const softwareLine = line(model, versionId, "SchC.27a.1");

    for (const item of personalItems) {
      // Find the amount of the named item in the transaction detail.
      const re = new RegExp(`${item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+([\\d,]+(?:\\.\\d{2})?)`, "i");
      const m = detail.text.match(re);
      if (!m || !softwareLine) continue;
      const amount = toCents(m[1]) ?? 0n;
      if (amount === 0n) continue;

      const engine = lineValueCents(softwareLine) ?? 0n;
      const delta = -amount; // remove personal amount from the expense
      const te = taxEffects(-delta, "schc_profit", { model, versionId }); // less expense => more profit
      out.push(
        makeFinding({
          checkId: this.id,
          title: `${item} (personal) is inside ${softwareLine.key}`,
          area: "Schedule C",
          secondSource: this.secondSource,
          status: "warn",
          expected: formatCents(engine + delta),
          actual: formatCents(engine),
          delta,
          taxEffectFed: te.taxFed,
          taxEffectCa: te.taxCa,
          rateCategory: "schc_profit",
          refs: [softwareLine.key, detail.docId ?? "", "call-01"].filter(Boolean),
          primaryRefs: [`${versionId}:${softwareLine.key}:${item}`],
          explanation: `The call note states "${item}" is personal (booked by mistake). The transaction detail shows ${item} ${formatCents(amount)} inside ${softwareLine.key} = ${formatCents(engine)}. Suggested removal ${formatCents(amount)}. Judgment (client statement).`,
          judgment: true,
        }),
      );
    }
    return out;
  },
};
