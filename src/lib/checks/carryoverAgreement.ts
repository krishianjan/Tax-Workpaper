import type { Check, CheckResult } from "./types";
import { makeFinding } from "./types";
import { formatDollars, toCents } from "../money";

// carryovers_into_2025 vs the 2024 return and the prior preparer workpaper.
// Reports each carryover, its stated source, and any federal/California
// disagreement (California keeps extra depreciation basis by design).

export const carryoverAgreement: Check = {
  id: "CARRYOVER_AGREEMENT",
  title: "Carryovers into 2025 agree to prior year",
  area: "Prior year",
  secondSource: "prior_year",
  run({ model }): CheckResult[] {
    const co = (model.raw.prior_years as Record<string, unknown>).carryovers_into_2025 as Record<string, unknown> | undefined;
    if (!co) return [];
    const ca = (co.california ?? {}) as Record<string, unknown>;
    const source = String(co.sources ?? "prior year");
    const out: CheckResult[] = [];

    for (const [key, val] of Object.entries(co)) {
      if (key === "california" || key === "sources" || key === "note") continue;
      if (typeof val !== "number") continue;
      const fed = toCents(val);
      const caVal = typeof ca[key] === "number" ? toCents(ca[key] as number) : fed;
      const agree = fed === caVal;
      out.push(
        makeFinding({
          checkId: this.id,
          title: `Carryover: ${key.replace(/_/g, " ")}`,
          area: this.area,
          secondSource: this.secondSource,
          status: agree ? "info" : "warn",
          expected: `federal ${formatDollars(fed)}`,
          actual: `California ${formatDollars(caVal)}`,
          delta: caVal !== null && fed !== null ? caVal - fed : null,
          refs: [`py:/carryovers_into_2025/${key}`],
          primaryRefs: [`py:/carryovers_into_2025/${key}`],
          explanation: agree
            ? `${formatDollars(fed)} carried from ${source}. Federal and California agree.`
            : `Federal ${formatDollars(fed)} vs California ${formatDollars(caVal)} — confirm the state difference (e.g. depreciation basis). Source: ${source}.`,
        }),
      );
    }
    return out;
  },
};
