// 6.1 Filing state machine, per jurisdiction. California depends on federal:
// it is held while federal is rejected and may only transmit after federal is
// accepted.

export type FilingState =
  | "in_preparation"
  | "in_review"
  | "partner_approved"
  | "client_review"
  | "client_signed"
  | "transmitted"
  | "rejected"
  | "retransmitted"
  | "accepted"
  | "frozen"
  | "held"; // CA only

const TRANSITIONS: Record<FilingState, FilingState[]> = {
  in_preparation: ["in_review"],
  in_review: ["partner_approved", "in_preparation"],
  partner_approved: ["client_review", "in_review"],
  client_review: ["client_signed", "partner_approved"],
  client_signed: ["transmitted", "held"],
  transmitted: ["accepted", "rejected"],
  rejected: ["retransmitted", "in_preparation"],
  retransmitted: ["accepted", "rejected"],
  accepted: ["frozen"],
  frozen: [],
  held: ["transmitted"],
};

export function canTransition(from: FilingState, to: FilingState): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** CA may only transmit (leave `held`) once federal is accepted or frozen. */
export function caMayTransmit(federalState: FilingState): boolean {
  return federalState === "accepted" || federalState === "frozen";
}

export function isFrozenState(s: FilingState): boolean {
  return s === "frozen";
}
