import type { Check, CheckResult } from "./types";
import { makeFinding } from "./types";

// Step-0 check (compliance, not a return error). v3 reports
// carryovers_out.federal.sep_contribution_not_deductible_for_2025 = 2,786
// (D26: SEP 18,000 deposited 2026-04-10). An excess/nondeductible SEP
// contribution may carry an excise tax or require corrective action — a matter
// for the CPA OUTSIDE the return. We do NOT assert the law; we raise it and
// mark it "CPA to determine". No return tax effect (judgment=true).

export const nondeductibleContribution: Check = {
  id: "NONDEDUCTIBLE_CONTRIBUTION",
  title: "Nondeductible retirement contribution — compliance review",
  area: "Completeness",
  secondSource: "engine_internal",
  run({ model, versionId }): CheckResult[] {
    const v = model.versionById.get(versionId);
    const carryovers = (v as unknown as { carryovers_out?: { federal?: Record<string, unknown> } } | undefined)
      ?.carryovers_out?.federal;
    if (!carryovers) return [];

    const out: CheckResult[] = [];
    const amount = carryovers["sep_contribution_not_deductible_for_2025"];
    if (typeof amount === "number" && amount > 0) {
      out.push(
        makeFinding({
          checkId: this.id,
          title: `SEP contribution not deductible for 2025: ${amount.toLocaleString()}`,
          area: this.area,
          secondSource: this.secondSource,
          status: "warn",
          judgment: true,
          expected: "deductible within the §408(k)/415 limit",
          actual: `${amount.toLocaleString()} nondeductible`,
          delta: null,
          taxEffectFed: 0n,
          taxEffectCa: 0n,
          refs: ["D26", `${versionId}:carryovers_out.federal.sep_contribution_not_deductible_for_2025`],
          primaryRefs: ["D26"],
          explanation:
            `The engine carries ${amount.toLocaleString()} of the SEP contribution (D26: 18,000 deposited ` +
            `2026-04-10) as not deductible for 2025. A nondeductible or excess contribution may trigger a 6% ` +
            `excise tax (Form 5330) or require a corrective distribution — a compliance matter outside the ` +
            `return. CPA to determine; an OutsideFiling row is opened to evaluate it.`,
          suggestedFix: { kind: "outside_filing", filing: "Excess/nondeductible SEP — evaluate Form 5330 / corrective action" },
        }),
      );
    }
    return out;
  },
};
