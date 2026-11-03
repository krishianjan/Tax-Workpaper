import type { Check, CheckResult } from "./types";
import { makeFinding } from "./types";
import { line, lineValueCents } from "./helpers";
import { toCents, formatCents } from "../money";
import { taxEffects } from "../effects";

// A call note gives business-use percentages that the engine ignored (used
// 100%). SchC.25 utilities = 3,480 (telephone 2,160 + internet 1,320). call-01:
// mobile ~70% business, internet ~50%. Suggested = 1,512 + 660 = 2,172. This is
// a JUDGMENT (client estimate) — suggested, not auto-applied.

function callText(model: import("../packet/model").PacketModel): string {
  const calls = (model.raw.client as Record<string, unknown>).call_notes;
  if (!Array.isArray(calls)) return "";
  return calls.map((c) => JSON.stringify(c)).join(" ");
}

function pctNear(text: string, keyword: RegExp): number | null {
  // Find a "<nn>%" or "<nn> percent" close to a keyword mention.
  const sentences = text.split(/(?<=[.;])\s+|",/);
  for (const s of sentences) {
    if (keyword.test(s)) {
      const m = s.match(/(\d{1,3})\s*%|(\d{1,3})\s*percent/i);
      if (m) return Number(m[1] ?? m[2]) / 100;
    }
  }
  return null;
}

export const businessUseFromEvidence: Check = {
  id: "BUSINESS_USE_FROM_EVIDENCE",
  title: "Business-use % from evidence vs 100% claimed",
  area: "Schedule C",
  secondSource: "client_answer",
  run({ model, versionId }): CheckResult[] {
    const utilities = line(model, versionId, "SchC.25");
    if (!utilities) return [];

    const booksDoc = model.documents.find((d) => d.document_type === "books_profit_loss");
    const evBy = (re: RegExp) => (model.evsByDoc.get(booksDoc?.id ?? "") ?? []).find((e) => re.test(e.field));
    const phone = evBy(/telephone|phone|mobile/i);
    const internet = evBy(/internet/i);
    if (!phone || !internet) return [];

    const text = callText(model);
    const phonePct = pctNear(text, /phone|mobile|line/i);
    const internetPct = pctNear(text, /internet/i);
    if (phonePct === null && internetPct === null) return [];

    const phoneCents = toCents(phone.value) ?? 0n;
    const internetCents = toCents(internet.value) ?? 0n;
    const engine = lineValueCents(utilities) ?? 0n;

    const suggestedPhone = phonePct !== null ? toCents(Number(phone.value) * phonePct) ?? 0n : phoneCents;
    const suggestedInternet = internetPct !== null ? toCents(Number(internet.value) * internetPct) ?? 0n : internetCents;
    const suggested = suggestedPhone + suggestedInternet;
    const delta = suggested - engine; // expense goes down
    const te = taxEffects(-delta, "schc_profit", { model, versionId }); // less expense => more profit

    return [
      makeFinding({
        checkId: this.id,
        title: "Phone/internet claimed at 100%; call note gives a lower business %",
        area: "Schedule C",
        secondSource: this.secondSource,
        status: "warn",
        expected: `${formatCents(suggested)} (phone ${phonePct !== null ? Math.round(phonePct * 100) + "%" : "100%"}, internet ${internetPct !== null ? Math.round(internetPct * 100) + "%" : "100%"})`,
        actual: formatCents(engine),
        delta,
        taxEffectFed: te.taxFed,
        taxEffectCa: te.taxCa,
        rateCategory: "schc_profit",
        refs: ["SchC.25", phone.id, internet.id, "call-01"],
        primaryRefs: [`${versionId}:SchC.25`],
        explanation: `SchC.25 = ${formatCents(engine)} deducts telephone and internet at 100%. The call note estimates business use of phone ${phonePct !== null ? Math.round(phonePct * 100) + "%" : "?"} and internet ${internetPct !== null ? Math.round(internetPct * 100) + "%" : "?"} → suggested ${formatCents(suggested)}. Judgment call (client estimate) — not auto-applied.`,
        judgment: true,
      }),
    ];
  },
};
