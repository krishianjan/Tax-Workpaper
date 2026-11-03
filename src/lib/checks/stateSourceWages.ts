import type { Check, CheckResult } from "./types";
import { makeFinding } from "./types";
import { line, lineValueCents } from "./helpers";
import { toCents, formatCents } from "../money";
import { taxEffect } from "../taxEffect";

// Residency timeline + paystub work-location vs CA-source wages. The engine put
// all wages on SchCA540NR.1.E (218,400) though the household moved to TX on
// 2025-07-15 and the paystub shows Austin work location with CA taxable YTD
// 22,469. We output a SUGGESTED CA-source amount, marked judgment — not applied.

export const stateSourceWages: Check = {
  id: "STATE_SOURCE_WAGES",
  title: "CA-source wages vs residency and work location",
  area: "State allocation",
  secondSource: "paystub",
  run({ model, versionId }): CheckResult[] {
    const caWageLine = line(model, versionId, "SchCA540NR.1.E");
    if (!caWageLine) return [];
    const engine = lineValueCents(caWageLine) ?? 0n;

    const paystub = model.documents.find((d) => d.document_type === "paystub");
    const caYtdEv = paystub
      ? (model.evsByDoc.get(paystub.id) ?? []).find((e) => /ca.*wage|california.*wage/i.test(e.field))
      : undefined;
    const suggested = caYtdEv ? (toCents(caYtdEv.value) ?? 0n) : null;

    const residency = (model.raw.household as Record<string, unknown>).residency;
    const caWindow = Array.isArray(residency)
      ? residency.find((r) => (r as Record<string, unknown>).state === "CA")
      : undefined;
    const caUntil = caWindow ? String((caWindow as Record<string, unknown>).to) : "mid-year";

    const delta = suggested !== null ? suggested - engine : null;
    const te = delta !== null ? taxEffect(delta, "ca_source_income", { model, versionId, caSource: true }) : null;

    return [
      makeFinding({
        checkId: this.id,
        title: "All wages assigned to California despite a part-year move",
        area: this.area,
        secondSource: this.secondSource,
        status: "warn",
        expected: suggested !== null ? `~${formatCents(suggested)} (paystub CA YTD)` : "part-year CA-source amount",
        actual: formatCents(engine),
        delta,
        taxEffectFed: te?.fed ?? null,
        taxEffectCa: te?.ca ?? null,
        rateCategory: "ca_source_income",
        refs: ["SchCA540NR.1.E", paystub?.id ?? "", caYtdEv?.id ?? ""].filter(Boolean),
        primaryRefs: [`${versionId}:SchCA540NR.1.E`],
        explanation: `CA-source wages = ${formatCents(engine)} equals total wages, but residency ended CA on ${caUntil} and the paystub shows an out-of-state work location with CA taxable YTD ${suggested !== null ? formatCents(suggested) : "n/a"}. This is a judgment call (payroll reporting vs work location vs residency); the preparer must decide — not auto-applied.`,
        judgment: true,
      }),
    ];
  },
};
