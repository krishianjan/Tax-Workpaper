import type { Check, CheckResult } from "./types";
import { makeFinding } from "./types";

// Household SSNs and names vs prior-year return dependents (and identity
// documents). Theo's SSN in the household (666-74-3309) differs from the 2024
// return (666-74-3390). Must be flagged BEFORE e-file.

function digits(s: unknown): string {
  return String(s ?? "").replace(/\D/g, "");
}

export const identityConsistency: Check = {
  id: "IDENTITY_CONSISTENCY",
  title: "SSN and name consistency vs prior year",
  area: "Identity",
  secondSource: "prior_year",
  run({ model }): CheckResult[] {
    const out: CheckResult[] = [];
    const people = (model.raw.household as Record<string, unknown>).people;
    const priorDeps = ((model.raw.prior_years as Record<string, unknown>).return_2024 as Record<string, unknown>)?.dependents;
    if (!Array.isArray(people) || !Array.isArray(priorDeps)) return out;

    const priorByName = new Map<string, string>();
    for (const d of priorDeps) {
      const o = d as Record<string, unknown>;
      priorByName.set(String(o.name).toLowerCase().trim(), digits(o.ssn));
    }

    for (const p of people) {
      const o = p as Record<string, unknown>;
      const name = String(o.name).toLowerCase().trim();
      const cur = digits(o.ssn);
      const prior = priorByName.get(name);
      if (prior && cur && prior !== cur) {
        out.push(
          makeFinding({
            checkId: this.id,
            title: `${o.name}: SSN differs from the 2024 return`,
            area: this.area,
            secondSource: this.secondSource,
            status: "fail",
            expected: `prior-year SSN ending ${prior.slice(-4)}`,
            actual: `household SSN ending ${cur.slice(-4)}`,
            delta: null,
            refs: [`household:${o.id}`, "py:/return_2024/dependents"],
            primaryRefs: [`household:${o.id}`],
            explanation: `${o.name}'s SSN in the household record ends ${cur.slice(-4)}, but the 2024 return ends ${prior.slice(-4)}. A transposed or mistyped SSN will cause an e-file rejection — resolve and verify to the Social Security card before e-file.`,
          }),
        );
      }
    }
    return out;
  },
};
