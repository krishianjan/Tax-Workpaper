// 6.3 Transmission, rejection, resubmission. A rejected submission is kept
// forever; retransmission creates a NEW submission. Error codes map (via a
// table, not string matching) to the correction they require.

export interface RejectionError {
  code: string;
  message: string;
}

export interface RejectionAction {
  code: string;
  createIssueArea: string;
  linkCheck: string;
  dependentId?: string;
  askClient: boolean;
  correctionField?: string;
  caughtBeforeFiling: boolean; // honest: did a pre-filing check already flag it?
}

// Configurable mapping of e-file reject codes to the correction each requires.
const REJECTION_MAP: Record<string, Omit<RejectionAction, "code">> = {
  "R0000-504-02": {
    createIssueArea: "Identity",
    linkCheck: "IDENTITY_CONSISTENCY",
    dependentId: "theo",
    askClient: true,
    correctionField: "ssn",
    caughtBeforeFiling: true, // Block 1 already flagged the Theo SSN mismatch
  },
};

export function parseRejection(errors: RejectionError[]): RejectionAction[] {
  return errors
    .map((e) => {
      const m = REJECTION_MAP[e.code];
      return m ? { code: e.code, ...m } : null;
    })
    .filter((x): x is RejectionAction => x !== null);
}

/** The transmitted snapshot must equal the signed 8879 snapshot (trap 7). */
export function snapshotHashMatches(signedHash: string, transmitHash: string): boolean {
  return signedHash.length > 0 && signedHash === transmitHash;
}

/** CA may transmit only after federal acceptance (trap 8). */
export function caMayRelease(federalStatus: string): boolean {
  return federalStatus === "accepted";
}

/** A rejected submission is immutable — never overwrite or delete it (trap 8). */
export function isImmutableSubmission(status: string): boolean {
  return status === "rejected" || status === "accepted";
}
