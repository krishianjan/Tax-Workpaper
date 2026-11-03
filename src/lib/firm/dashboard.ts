// 7.4 Firm status dashboard. A pure projection: every engagement with its
// filing state per jurisdiction, next deadline, open blockers, budget %, and
// assignees. The packet has ONE client plus the 2026 rollforward engagement
// (Block 3) — we build the multi-engagement view and its empty states; we never
// invent clients.

export interface JurisdictionFiling {
  jurisdiction: string;
  state: string; // in_preparation | ready | transmitted | rejected | accepted | ...
}

export interface EngagementInput {
  id: string;
  client: string;
  taxYear: number;
  filings: JurisdictionFiling[];
  nextDeadline?: { what: string; date: string } | null;
  openBlockers: number;
  budgetPct: number; // 0..∞
  assignees: Array<{ role: string; staffId: string }>;
  placeholder?: boolean; // a not-yet-started engagement (e.g. 2026 rollforward)
}

export interface EngagementRow extends EngagementInput {
  overallState: string;
  blocked: boolean;
  overBudget: boolean;
}

/** The engagement's headline state: the least-advanced jurisdiction wins, so a
 *  CA still in preparation is not hidden by an accepted federal. */
const STATE_ORDER = [
  "in_preparation",
  "ready",
  "held",
  "transmitted",
  "rejected",
  "accepted",
];

function leastAdvanced(filings: JurisdictionFiling[]): string {
  if (filings.length === 0) return "not_started";
  let worst = filings[0].state;
  let worstIdx = STATE_ORDER.indexOf(worst);
  for (const f of filings) {
    const idx = STATE_ORDER.indexOf(f.state);
    if (idx >= 0 && (worstIdx < 0 || idx < worstIdx)) {
      worst = f.state;
      worstIdx = idx;
    }
  }
  return worst;
}

export function buildEngagementRow(input: EngagementInput): EngagementRow {
  return {
    ...input,
    overallState: input.placeholder ? "not_started" : leastAdvanced(input.filings),
    blocked: input.openBlockers > 0,
    overBudget: input.budgetPct >= 100,
  };
}

export interface Dashboard {
  rows: EngagementRow[];
  empty: boolean;
  totals: { engagements: number; blocked: number; overBudget: number };
}

export function buildDashboard(inputs: EngagementInput[]): Dashboard {
  const rows = inputs.map(buildEngagementRow);
  return {
    rows,
    empty: rows.length === 0,
    totals: {
      engagements: rows.length,
      blocked: rows.filter((r) => r.blocked).length,
      overBudget: rows.filter((r) => r.overBudget).length,
    },
  };
}
