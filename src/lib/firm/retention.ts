// 7.4 Retention. destroy-after = filed date + retentionYears (from the active
// standard). A legal hold (any open notice) blocks destruction. The job runs in
// DRY-RUN only and lists what it WOULD destroy — this app never deletes; it
// records the decision.

export interface RetentionInput {
  engagementId: string;
  filedDate: string | null; // ISO; null => not filed, never eligible
  retentionYears: number;
  legalHold: boolean; // true when an open notice exists
  now: string; // ISO (asOf)
}

export interface RetentionPlan {
  engagementId: string;
  filedDate: string | null;
  destroyAfter: string | null; // ISO date
  pastRetention: boolean;
  legalHold: boolean;
  eligibleForDestruction: boolean; // past retention AND no legal hold AND filed
  action: "retain" | "would_destroy" | "hold";
  note: string;
  dryRun: true; // always — we never delete
}

/** Add whole years to an ISO date, returning a YYYY-MM-DD string. */
export function addYears(iso: string, years: number): string {
  const d = new Date(iso);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

export function retentionPlan(input: RetentionInput): RetentionPlan {
  if (!input.filedDate) {
    return {
      engagementId: input.engagementId,
      filedDate: null,
      destroyAfter: null,
      pastRetention: false,
      legalHold: input.legalHold,
      eligibleForDestruction: false,
      action: "retain",
      note: "Not filed — retention clock has not started.",
      dryRun: true,
    };
  }

  const destroyAfter = addYears(input.filedDate, input.retentionYears);
  const pastRetention = Date.parse(input.now) >= Date.parse(destroyAfter);

  if (input.legalHold) {
    return {
      engagementId: input.engagementId,
      filedDate: input.filedDate,
      destroyAfter,
      pastRetention,
      legalHold: true,
      eligibleForDestruction: false,
      action: "hold",
      note: `Legal hold (open notice) blocks destruction; retain regardless of the ${destroyAfter} date.`,
      dryRun: true,
    };
  }

  const eligible = pastRetention;
  return {
    engagementId: input.engagementId,
    filedDate: input.filedDate,
    destroyAfter,
    pastRetention,
    legalHold: false,
    eligibleForDestruction: eligible,
    action: eligible ? "would_destroy" : "retain",
    note: eligible
      ? `Past the ${destroyAfter} retention date with no legal hold — would be listed for destruction (dry-run only; nothing is deleted).`
      : `Retain until ${destroyAfter}.`,
    dryRun: true,
  };
}
