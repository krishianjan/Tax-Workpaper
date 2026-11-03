import type { PacketModel } from "../packet/model";
import type { Issue } from "../issues/group";
import type { ExpectedDoc } from "./expectedDocs";
import { allExpectedAccountedFor } from "./expectedDocs";

// 4.6 Prove completeness: three registers + a COMPUTED gate. Readiness is never
// a free-text claim — it is derived (all issues resolved/dismissed, all
// documents disposed, all decisions approved). The preparer attests only when an
// area is green, or with an explicit override a reviewer signs.

export const EXTRA_AREAS = ["foreign", "retirement", "dependents_and_education", "payments", "identity"];

export function completenessAreas(model: PacketModel): string[] {
  const budget = (model.raw.firm as Record<string, unknown>).budget_hours as Record<string, unknown> | undefined;
  const fromBudget = budget ? Object.keys(budget).filter((k) => k !== "partner_review") : [];
  return [...new Set([...fromBudget, ...EXTRA_AREAS])];
}

// Map an Issue's area label to a completeness area key.
const AREA_MAP: Record<string, string> = {
  "Wages & income": "wages_and_stock_compensation",
  "Schedule C": "business",
  "Capital gains & 8949": "investments_and_digital_assets",
  "Digital assets": "investments_and_digital_assets",
  "Payments": "payments",
  "State allocation": "california",
  "Identity": "identity",
  "Prior year": "intake_and_engagement",
};

export function areaOfIssue(issue: Issue): string {
  return AREA_MAP[issue.area] ?? "intake_and_engagement";
}

export interface AreaReadinessInput {
  area: string;
  openIssues: number; // issues not resolved/dismissed
  pendingDecisions: number; // decisions not approved
  undisposedDocs: number;
  attestedBy: string | null;
}

export interface AreaReadiness extends AreaReadinessInput {
  computed: "green" | "red";
}

export function computeAreaReadiness(input: AreaReadinessInput): AreaReadiness {
  const green = input.openIssues === 0 && input.pendingDecisions === 0 && input.undisposedDocs === 0;
  return { ...input, computed: green ? "green" : "red" };
}

export interface Gate {
  green: boolean;
  blockers: string[];
}

/** The completeness gate is green only when every register is complete. */
export function computeGate(input: {
  expectedDocs: ExpectedDoc[];
  areas: AreaReadiness[];
  dueDiligenceComplete: boolean;
  openBlockingIssues: string[];
  outsideFilingsResolved: boolean;
}): Gate {
  const blockers: string[] = [];
  if (!allExpectedAccountedFor(input.expectedDocs))
    blockers.push(`${input.expectedDocs.filter((d) => d.status === "expected").length} expected document(s) unmatched`);
  const unattested = input.areas.filter((a) => a.computed !== "green" || !a.attestedBy);
  for (const a of unattested) blockers.push(`area '${a.area}' not green/attested`);
  if (!input.dueDiligenceComplete) blockers.push("Form 8867 due diligence not completed and signed");
  for (const id of input.openBlockingIssues) blockers.push(`blocking issue open: ${id}`);
  if (!input.outsideFilingsResolved) blockers.push("outside filings register incomplete");
  return { green: blockers.length === 0, blockers };
}
