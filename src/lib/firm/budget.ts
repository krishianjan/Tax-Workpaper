import type { PacketModel } from "../packet/model";

// 7.3 Time against budget. Pure projection over TimeEntry rows + the firm's
// budget_hours. Driven by the asOf clock so the burn-down reflects the season
// to date. The partner_review budget is tracked as its own line (partner review
// hours are kept separate from preparer/reviewer area time).

export interface TimeEntryT {
  staffId: string;
  area: string;
  minutes: number;
  at: string; // ISO
}

export type BudgetAlert = "none" | "warn_80" | "over_100";

export interface AreaBudget {
  area: string;
  budgetMinutes: number;
  actualMinutes: number;
  remainingMinutes: number; // may be negative when over budget
  pct: number; // 0..∞
  alert: BudgetAlert;
}

export interface StaffTime {
  staffId: string;
  minutes: number;
}

export interface BurnPoint {
  date: string; // YYYY-MM-DD
  cumulativeMinutes: number;
}

export interface BudgetReport {
  asOf: string;
  byArea: AreaBudget[];
  byStaff: StaffTime[];
  partnerReview: AreaBudget;
  burndown: BurnPoint[];
  totalBudgetMinutes: number;
  totalActualMinutes: number;
}

export const PARTNER_REVIEW_AREA = "partner_review";

function alertFor(pct: number): BudgetAlert {
  if (pct >= 100) return "over_100";
  if (pct >= 80) return "warn_80";
  return "none";
}

/** budget_hours (hours) → minutes, keyed by area. */
export function budgetMinutesByArea(model: PacketModel): Map<string, number> {
  const hours = ((model.raw.firm as Record<string, unknown>).budget_hours ?? {}) as Record<string, number>;
  const m = new Map<string, number>();
  for (const [area, h] of Object.entries(hours)) m.set(area, Math.round(Number(h) * 60));
  return m;
}

function areaBudget(area: string, budgetMin: number, actualMin: number): AreaBudget {
  const pct = budgetMin > 0 ? (actualMin / budgetMin) * 100 : actualMin > 0 ? Infinity : 0;
  return {
    area,
    budgetMinutes: budgetMin,
    actualMinutes: actualMin,
    remainingMinutes: budgetMin - actualMin,
    pct,
    alert: alertFor(pct),
  };
}

/** Build the full report. Only entries at/before asOf count (season to date). */
export function buildBudgetReport(model: PacketModel, entries: TimeEntryT[], asOf: string): BudgetReport {
  const asOfT = Date.parse(asOf);
  const inWindow = entries.filter((e) => Date.parse(e.at) <= asOfT);

  const budgets = budgetMinutesByArea(model);
  const actualByArea = new Map<string, number>();
  const byStaff = new Map<string, number>();
  for (const e of inWindow) {
    actualByArea.set(e.area, (actualByArea.get(e.area) ?? 0) + e.minutes);
    byStaff.set(e.staffId, (byStaff.get(e.staffId) ?? 0) + e.minutes);
  }

  // Every budgeted area (except partner_review) plus any area with time logged.
  const areaKeys = new Set<string>([...budgets.keys(), ...actualByArea.keys()]);
  areaKeys.delete(PARTNER_REVIEW_AREA);

  const byArea: AreaBudget[] = [...areaKeys]
    .sort()
    .map((area) => areaBudget(area, budgets.get(area) ?? 0, actualByArea.get(area) ?? 0));

  const partnerReview = areaBudget(
    PARTNER_REVIEW_AREA,
    budgets.get(PARTNER_REVIEW_AREA) ?? 0,
    actualByArea.get(PARTNER_REVIEW_AREA) ?? 0,
  );

  // Burn-down: cumulative total minutes by day, up to asOf.
  const byDay = new Map<string, number>();
  for (const e of inWindow) {
    const day = e.at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + e.minutes);
  }
  let running = 0;
  const burndown: BurnPoint[] = [...byDay.keys()]
    .sort()
    .map((date) => {
      running += byDay.get(date) ?? 0;
      return { date, cumulativeMinutes: running };
    });

  const totalBudgetMinutes = [...budgets.values()].reduce((s, v) => s + v, 0);
  const totalActualMinutes = inWindow.reduce((s, e) => s + e.minutes, 0);

  return {
    asOf,
    byArea,
    byStaff: [...byStaff.entries()].map(([staffId, minutes]) => ({ staffId, minutes })).sort((a, b) => b.minutes - a.minutes),
    partnerReview,
    burndown,
    totalBudgetMinutes,
    totalActualMinutes,
  };
}
