import type { Check, CheckResult } from "./types";
import { makeFinding } from "./types";
import { line, lineValueCents } from "./helpers";
import { buildCrosswalk } from "../crosswalk";
import { toCents, formatDollars } from "../money";

// Every line with a 2024 counterpart: flag if the change exceeds BOTH thresholds
// from firm standards (not hardcoded): variance_review.flag_if_change_over_percent
// and and_over_amount. Also lists unmatched prior-year lines as findings.

function thresholds(model: import("../packet/model").PacketModel) {
  const vr = ((model.raw.firm as Record<string, unknown>).starter_standards as Record<string, unknown>)
    ?.variance_review as Record<string, unknown> | undefined;
  return {
    pct: typeof vr?.flag_if_change_over_percent === "number" ? vr.flag_if_change_over_percent : 10,
    amt: typeof vr?.and_over_amount === "number" ? vr.and_over_amount : 1000,
  };
}

export const priorYearVariance: Check = {
  id: "PRIOR_YEAR_VARIANCE",
  title: "Year-over-year variance vs 2024",
  area: "Prior year",
  secondSource: "prior_year",
  run({ model, versionId }): CheckResult[] {
    const out: CheckResult[] = [];
    const { pct, amt } = thresholds(model);
    const amtCents = BigInt(Math.round(amt * 100));
    const prior = (model.raw.prior_years as Record<string, unknown>).return_2024 as Record<string, unknown>;
    const lines2024 = (prior?.lines ?? {}) as Record<string, unknown>;
    const crosswalk = buildCrosswalk(model, versionId);

    for (const e of crosswalk) {
      if (e.status === "no_counterpart" || !e.key2025) {
        out.push(
          makeFinding({
            checkId: this.id,
            title: `2024 ${e.key2024} has no 2025 counterpart`,
            area: this.area,
            secondSource: this.secondSource,
            status: "info",
            refs: [e.key2024],
            primaryRefs: [`py:${e.key2024}`],
            explanation: e.reason,
          }),
        );
        continue;
      }
      const old = toCents(lines2024[e.key2024]);
      const now = lineValueCents(line(model, versionId, e.key2025));
      if (old === null || now === null) continue;
      const change = now - old;
      const absChange = change < 0n ? -change : change;
      const pctChange = old === 0n ? Infinity : (Number(absChange) / Math.abs(Number(old))) * 100;
      if (pctChange > pct && absChange > amtCents) {
        out.push(
          makeFinding({
            checkId: this.id,
            title: `${e.key2025} changed ${pctChange === Infinity ? "" : pctChange.toFixed(0) + "% "}from 2024`,
            area: this.area,
            secondSource: this.secondSource,
            status: "warn",
            expected: `2024: ${formatDollars(old)}`,
            actual: `2025: ${formatDollars(now)}`,
            delta: change,
            refs: [e.key2025, e.key2024],
            primaryRefs: [`${versionId}:${e.key2025}`],
            explanation: `${formatDollars(old)} → ${formatDollars(now)} (${pctChange === Infinity ? "new" : pctChange.toFixed(0) + "%"}, ${formatDollars(change)}). Exceeds the firm threshold (> ${pct}% and > ${formatDollars(amtCents)}). Explain the swing.`,
          }),
        );
      }
    }
    return out;
  },
};
