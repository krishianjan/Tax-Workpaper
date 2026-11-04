// "Next actions" for the overview — the filing-gate blockers, each pointing at
// the exact page that clears it. Pure: the page gathers the counts (DB-tolerant)
// and passes them in.

export interface NextAction {
  label: string;
  href: string;
  count?: number;
  tone: "red" | "amber" | "slate";
}

export interface NextActionInputs {
  openIssues: number;
  needsAttention: number; // verifications: mismatch / not printed / needs human
  reviewOpen?: number;
  questionsOpen?: number;
  decisionsPending?: number;
  recomputeResidual?: boolean;
  clientApprovalPending?: boolean;
}

export function computeNextActions(i: NextActionInputs): NextAction[] {
  const out: NextAction[] = [];
  if (i.openIssues > 0) out.push({ label: "Resolve return-affecting issues", href: "/issues", count: i.openIssues, tone: "red" });
  if (i.needsAttention > 0) out.push({ label: "Verify values flagged against source", href: "/checks", count: i.needsAttention, tone: "amber" });
  if (i.reviewOpen) out.push({ label: "Clear blocking review notes", href: "/review", count: i.reviewOpen, tone: "red" });
  if (i.questionsOpen) out.push({ label: "Answer open questions", href: "/questions", count: i.questionsOpen, tone: "amber" });
  if (i.decisionsPending) out.push({ label: "Record / approve judgment calls", href: "/decisions", count: i.decisionsPending, tone: "amber" });
  if (i.recomputeResidual) out.push({ label: "Reconcile the regular-tax recompute residual", href: "/records/tax-computation", tone: "amber" });
  if (i.clientApprovalPending) out.push({ label: "Client approval & e-file authorization (8879)", href: "/client", tone: "slate" });
  return out;
}
