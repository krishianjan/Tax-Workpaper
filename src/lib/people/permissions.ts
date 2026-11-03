// 5.1 Enforced roles. One pure function the UI, API and replay all call.
// Deny by default. Every command checks this before touching state.

export type Role = "preparer" | "reviewer" | "partner" | "quality_reviewer" | "firm_administrator" | "client";

export interface Actor {
  id: string;
  role: Role;
  clearance: boolean;
  activeFrom: string; // ISO; no action before it
}

export type Action =
  | "content.create" // propose adjustments/decisions
  | "content.review"
  | "content.approve"
  | "content.revert"
  | "signoff.preparer"
  | "signoff.reviewer"
  | "signoff.partner"
  | "signoff.quality"
  | "filing.release"
  | "reviewnote.create"
  | "reviewnote.address"
  | "reviewnote.clear"
  | "question.ask"
  | "question.answer"
  | "question.accept"
  | "client.approve"
  | "form8879.sign"
  | "staff.manage"
  | "assignment.manage"
  | "standards.manage"
  | "deadline.manage"
  | "unmask"
  | "view.internal"
  | "view.engagement"
  | "amendment.open"
  | "timeentry.log";

export interface Resource {
  kind: string;
  preparedBy?: string | null;
  reviewedBy?: string | null;
  ownerClientId?: string | null; // for client-owned resources
  engagementId?: string | null;
  staffOnly?: boolean; // internal notes, staff-only issues
  assigneeId?: string | null; // for review notes
  authorId?: string | null; // for review notes
}

export interface PermCtx {
  now: string; // ISO
  frozen?: boolean;
  /** The client user ids that belong to the actor's own engagement (for clients). */
  ownEngagementClientIds?: string[];
  /** True when the action targets post-filing content a quality reviewer may touch. */
  postFiling?: boolean;
}

export interface PermDecision {
  allow: boolean;
  reason: string;
}

const STAFF_ROLES: Role[] = ["preparer", "reviewer", "partner", "quality_reviewer", "firm_administrator"];
const REVIEW_ROLES: Role[] = ["reviewer", "partner", "quality_reviewer"];

// Base role → allowed actions (before cross-cutting gates).
const MATRIX: Record<Role, Set<Action>> = {
  preparer: new Set<Action>([
    "content.create", "signoff.preparer", "reviewnote.address", "question.ask", "question.answer", "question.accept",
    "view.internal", "view.engagement", "amendment.open", "timeentry.log", "unmask",
  ]),
  reviewer: new Set<Action>([
    "content.create", "content.review", "content.approve", "content.revert", "signoff.reviewer",
    "reviewnote.create", "reviewnote.address", "reviewnote.clear", "question.ask", "question.answer", "question.accept",
    "view.internal", "view.engagement", "amendment.open", "timeentry.log", "unmask",
  ]),
  partner: new Set<Action>([
    "content.create", "content.review", "content.approve", "content.revert", "signoff.reviewer", "signoff.partner",
    "filing.release", "reviewnote.create", "reviewnote.address", "reviewnote.clear", "question.ask", "question.answer",
    "question.accept", "view.internal", "view.engagement", "amendment.open", "timeentry.log", "unmask",
  ]),
  quality_reviewer: new Set<Action>([
    "signoff.quality", "reviewnote.create", "reviewnote.clear", "view.internal", "view.engagement",
    "amendment.open", "timeentry.log", "unmask",
  ]),
  firm_administrator: new Set<Action>([
    "staff.manage", "assignment.manage", "standards.manage", "deadline.manage", "view.engagement", "view.internal", "unmask",
  ]),
  client: new Set<Action>(["question.ask", "question.answer", "client.approve", "form8879.sign", "view.engagement"]),
};

// Actions that write tax content / move state — blocked when frozen.
const WRITE_WHEN_UNFROZEN: Set<Action> = new Set([
  "content.create", "content.review", "content.approve", "content.revert",
  "signoff.preparer", "signoff.reviewer", "signoff.partner", "filing.release",
  "reviewnote.address", "reviewnote.clear", "client.approve", "form8879.sign",
]);

// Review/approve/sign actions require independence from who prepared the item.
const INDEPENDENCE_ACTIONS: Set<Action> = new Set([
  "content.review", "content.approve", "signoff.reviewer", "signoff.partner", "reviewnote.clear",
]);

export function can(actor: Actor, action: Action, resource: Resource, ctx: PermCtx): PermDecision {
  // 1. active_from gate (Sam before 2027-01-04; Marcus before 2026-03-24).
  if (Date.parse(ctx.now) < Date.parse(actor.activeFrom))
    return { allow: false, reason: `${actor.id} is not active until ${actor.activeFrom}.` };

  // 2. role must permit the action at all.
  if (!MATRIX[actor.role].has(action))
    return { allow: false, reason: `Role '${actor.role}' may not perform '${action}'.` };

  // 3. client isolation: only their own engagement, never internal/staff-only.
  if (actor.role === "client") {
    if (action === "view.internal") return { allow: false, reason: "Clients never see internal notes or staff-only issues." };
    if (resource.staffOnly) return { allow: false, reason: "Staff-only resource." };
    const own = ctx.ownEngagementClientIds ?? [];
    if (resource.ownerClientId && !own.includes(resource.ownerClientId))
      return { allow: false, reason: "Clients may only act within their own engagement." };
  }

  // 4. admin may never approve or sign tax content.
  if (actor.role === "firm_administrator" && (action === "content.approve" || action.startsWith("signoff")))
    return { allow: false, reason: "The firm administrator cannot approve or sign tax content." };

  // 5. frozen state blocks writes (quality post-filing review notes are allowed).
  if (ctx.frozen && WRITE_WHEN_UNFROZEN.has(action)) {
    const qualityPostFiling = actor.role === "quality_reviewer" && action === "reviewnote.create";
    if (!qualityPostFiling) return { allow: false, reason: "Frozen: the return is filed. Open an amendment." };
  }

  // 6. independence at item level: no one reviews/approves/signs what they prepared.
  if (INDEPENDENCE_ACTIONS.has(action)) {
    if (resource.preparedBy && resource.preparedBy === actor.id)
      return { allow: false, reason: "A person may not review, approve or sign off work they prepared." };
    if ((action === "content.approve" || action === "signoff.partner") && resource.reviewedBy === actor.id)
      return { allow: false, reason: "A person may not both review and approve/sign the same item." };
  }

  // 7. review-note clear: author or a higher review level only (assignee may just address).
  if (action === "reviewnote.clear") {
    const isAuthor = resource.authorId === actor.id;
    const higher = REVIEW_ROLES.includes(actor.role);
    if (!isAuthor && !higher) return { allow: false, reason: "Only the author or a higher review level may clear a note." };
  }
  if (action === "reviewnote.address") {
    if (resource.assigneeId && resource.assigneeId !== actor.id && !STAFF_ROLES.includes(actor.role))
      return { allow: false, reason: "Only the assignee may mark a note addressed." };
  }

  // 8. unmasking: cleared staff only; never st-04/clients/uncleared admins.
  if (action === "unmask" && !actor.clearance)
    return { allow: false, reason: "Sensitive data stays masked without clearance." };

  return { allow: true, reason: "ok" };
}
