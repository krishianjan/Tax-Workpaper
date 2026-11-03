import type { Check, CheckContext, CheckResult } from "./types";
import { sumRecompute } from "./sumRecompute";
import { valueVsPrint } from "./valueVsPrint";
import { duplicateDocument } from "./duplicateDocument";
import { duplicatePage } from "./duplicatePage";
import { partialExtraction } from "./partialExtraction";
import { brokerSummaryVsDetail } from "./brokerSummaryVsDetail";
import { missingOrZeroBasis } from "./missingOrZeroBasis";
import { thirdPartyVsBooks } from "./thirdPartyVsBooks";
import { paymentsVsAgency } from "./paymentsVsAgency";
import { stateSourceWages } from "./stateSourceWages";
import { questionnaireVsDocs } from "./questionnaireVsDocs";
import { identityConsistency } from "./identityConsistency";
import { priorYearVariance } from "./priorYearVariance";
import { carryoverAgreement } from "./carryoverAgreement";
import { versionDiff } from "./versionDiff";
import { engineDiagnostics } from "./engineDiagnostics";
import { payeeNameConsistency } from "./payeeNameConsistency";

export const ALL_CHECKS: Check[] = [
  sumRecompute,
  valueVsPrint,
  duplicateDocument,
  duplicatePage,
  partialExtraction,
  brokerSummaryVsDetail,
  missingOrZeroBasis,
  thirdPartyVsBooks,
  paymentsVsAgency,
  stateSourceWages,
  questionnaireVsDocs,
  identityConsistency,
  priorYearVariance,
  carryoverAgreement,
  versionDiff,
  engineDiagnostics,
  payeeNameConsistency,
];

export const CODE_VERSION = "block2-1";

/** Run every check and return findings, deduped by stable id (idempotent). */
export function runChecks(ctx: CheckContext, checks: Check[] = ALL_CHECKS): CheckResult[] {
  const byId = new Map<string, CheckResult>();
  for (const check of checks) {
    let results: CheckResult[];
    try {
      results = check.run(ctx);
    } catch (e) {
      results = [
        {
          id: `error-${check.id}`,
          checkId: check.id,
          title: `${check.id} failed to run`,
          area: check.area,
          secondSource: check.secondSource,
          status: "warn",
          refs: [],
          explanation: `Check threw: ${(e as Error).message}`,
        },
      ];
    }
    for (const r of results) byId.set(r.id, r); // stable id => idempotent dedupe
  }
  return [...byId.values()];
}

function absBig(x: bigint | null | undefined): bigint {
  const v = x ?? 0n;
  return v < 0n ? -v : v;
}

/** Sort findings by |federal tax effect| then |delta|, descending. */
export function sortByImpact(results: CheckResult[]): CheckResult[] {
  return [...results].sort((a, b) => {
    const fa = absBig(a.taxEffectFed) + absBig(a.taxEffectCa);
    const fb = absBig(b.taxEffectFed) + absBig(b.taxEffectCa);
    if (fa !== fb) return fa > fb ? -1 : 1;
    const da = absBig(a.delta);
    const db = absBig(b.delta);
    if (da !== db) return da > db ? -1 : 1;
    return a.checkId.localeCompare(b.checkId);
  });
}

export interface PreviewTotals {
  failingCount: number;
  taxEffectFed: bigint;
  taxEffectCa: bigint;
}

/**
 * Workpaper preview = v3 + Σ effects of FAILING checks (not yet approved).
 * Judgment items are excluded from the auto-applied total.
 */
export function previewTotals(results: CheckResult[]): PreviewTotals {
  let fed = 0n;
  let ca = 0n;
  let failing = 0;
  for (const r of results) {
    if (r.status !== "fail" || r.judgment) continue;
    failing += 1;
    fed += r.taxEffectFed ?? 0n;
    ca += r.taxEffectCa ?? 0n;
  }
  return { failingCount: failing, taxEffectFed: fed, taxEffectCa: ca };
}
