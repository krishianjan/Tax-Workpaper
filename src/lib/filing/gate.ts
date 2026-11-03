// 6.1 The filing gate = the 12 required steps (each computed from data, not a
// checkbox) PLUS: no open blocking review notes or questions, all sign-offs
// valid, the completeness gate green, no stale adjustments, and no unapproved
// judgment issues. A failed gate lists the exact blockers.

export interface RequiredStep {
  name: string;
  done: boolean;
  detail: string;
}

export interface GateFacts {
  requiredSteps: RequiredStep[];
  openBlockingNotes: number;
  openBlockingQuestions: number;
  reopenedSignoffs: number;
  completenessGreen: boolean;
  staleAdjustments: number;
  unapprovedJudgmentIssues: number;
  bothSpousesSigned: boolean;
}

export interface GateResult {
  green: boolean;
  blockers: string[];
}

/** Compute the 12 required steps from derived facts (no string matching). */
export function computeRequiredSteps(facts: {
  engagementSigned: boolean;
  identityVerified: boolean;
  priorYearReviewed: boolean;
  documentsAccounted: boolean;
  variancesExplained: boolean;
  carryoversAgreed: boolean;
  paymentsAgreed: boolean;
  dueDiligenceComplete: boolean;
  diagnosticsResolved: boolean;
  reviewerSignedOff: boolean;
  partnerSignedOff: boolean;
  clientApproved: boolean;
}): RequiredStep[] {
  return [
    { name: "Engagement letter and consents signed", done: facts.engagementSigned, detail: "D01/consent docs signed." },
    { name: "Identity verified", done: facts.identityVerified, detail: "Dependent SSNs agree with evidence and 2024." },
    { name: "Prior-year return reviewed", done: facts.priorYearReviewed, detail: "2024 return (D06) reviewed." },
    { name: "All documents accounted for", done: facts.documentsAccounted, detail: "74/74 dispositions." },
    { name: "Prior-year variances explained", done: facts.variancesExplained, detail: "Every flagged swing has an explanation." },
    { name: "Carryovers agreed to prior year", done: facts.carryoversAgreed, detail: "Carryovers match the 2024 return." },
    { name: "Estimated payments agreed to IRS and FTB records", done: facts.paymentsAgreed, detail: "Payment issues resolved." },
    { name: "Due diligence completed", done: facts.dueDiligenceComplete, detail: "Form 8867 completed and signed." },
    { name: "Diagnostics resolved", done: facts.diagnosticsResolved, detail: "Engine diagnostics addressed." },
    { name: "Reviewer sign-off", done: facts.reviewerSignedOff, detail: "Valid reviewer return sign-off." },
    { name: "Partner sign-off", done: facts.partnerSignedOff, detail: "Valid partner return sign-off." },
    { name: "Client approval and e-file authorization", done: facts.clientApproved, detail: "Both spouses signed the 8879." },
  ];
}

export function computeFilingGate(f: GateFacts): GateResult {
  const blockers: string[] = [];
  for (const s of f.requiredSteps) if (!s.done) blockers.push(`Required step incomplete: ${s.name}`);
  if (f.openBlockingNotes > 0) blockers.push(`${f.openBlockingNotes} open blocking review note(s)`);
  if (f.openBlockingQuestions > 0) blockers.push(`${f.openBlockingQuestions} open blocking question(s)`);
  if (f.reopenedSignoffs > 0) blockers.push(`${f.reopenedSignoffs} reopened sign-off(s)`);
  if (!f.completenessGreen) blockers.push("Completeness gate is not green");
  if (f.staleAdjustments > 0) blockers.push(`${f.staleAdjustments} stale adjustment(s)`);
  if (f.unapprovedJudgmentIssues > 0) blockers.push(`${f.unapprovedJudgmentIssues} unapproved judgment issue(s)`);
  if (!f.bothSpousesSigned) blockers.push("Both spouses must sign the 8879");
  return { green: blockers.length === 0, blockers };
}
