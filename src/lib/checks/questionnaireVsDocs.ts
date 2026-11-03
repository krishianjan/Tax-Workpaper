import type { Check, CheckResult } from "./types";
import { makeFinding } from "./types";
import { all8949Lots } from "./helpers";

// Client answers vs document evidence. A questionnaire answer never outranks a
// document or agency record; we show both. qa-14 "no investments sold" conflicts
// with hundreds of 8949 lots and digital-asset dispositions.

function qa(model: import("../packet/model").PacketModel, id: string) {
  const item = model.clientItemById.get(id);
  return item ? String((item as Record<string, unknown>).answer ?? "") : null;
}

export const questionnaireVsDocs: Check = {
  id: "QUESTIONNAIRE_VS_DOCS",
  title: "Client answers vs document evidence",
  area: "Capital gains & 8949",
  secondSource: "client_answer",
  run({ model, versionId }): CheckResult[] {
    const out: CheckResult[] = [];

    const soldAnswer = qa(model, "qa-14");
    if (soldAnswer !== null && /^no\b|\bnone\b|did not/i.test(soldAnswer.trim())) {
      const lots = all8949Lots(model, versionId);
      const digital = lots.filter((l) => l.box === "H" || /btc|crypto|coin|units/i.test(l.raw)).length;
      const brokerage = lots.length - digital;
      out.push(
        makeFinding({
          checkId: this.id,
          title: 'Questionnaire says "no investments sold" but the return reports sales',
          area: this.area,
          secondSource: this.secondSource,
          status: "warn",
          expected: "no sales (per qa-14)",
          actual: `${brokerage} brokerage lots + ${digital} digital-asset dispositions`,
          delta: null,
          refs: ["qa-14"],
          primaryRefs: ["qa-14"],
          explanation: `qa-14 answer: "${soldAnswer.trim()}". The documents and return show ${lots.length} Form 8949 lots (${digital} digital-asset). The document evidence governs; the questionnaire answer must be corrected with the client.`,
        }),
      );
    }

    // IRA nondeductible basis: questionnaire vs prior-year basis.
    const iraAnswer = qa(model, "qa-31");
    const priorBasis = (model.raw.prior_years as Record<string, unknown>).basis_records as Record<string, unknown> | undefined;
    if (iraAnswer && priorBasis && "ira_nondeductible_basis" in priorBasis) {
      out.push(
        makeFinding({
          checkId: this.id,
          title: "IRA nondeductible basis — confirm against prior year",
          area: "Prior year",
          secondSource: "prior_year",
          status: "info",
          expected: JSON.stringify(priorBasis.ira_nondeductible_basis),
          actual: iraAnswer.trim(),
          delta: null,
          refs: ["qa-31", "py:/basis_records/ira_nondeductible_basis"],
          primaryRefs: ["qa-31"],
          explanation: `Client (qa-31): "${iraAnswer.trim()}". Reconcile the 2025 contribution and prior basis with the prior-year Form 8606.`,
        }),
      );
    }
    return out;
  },
};
