import type { PacketModel } from "../packet/model";
import type { Adjustment, ActorRef } from "./types";
import type { Effects } from "../effects";

// Approval rules, enforced server-side (these pure functions are the source of
// truth the server actions call). Traps handled:
//  - partner required if |fed| OR |CA| effect > threshold (not fed only);
//  - no one acts twice: reviewer ≠ preparer, approver ∉ {preparer, reviewer};
//  - payment-only adjustments still need a reviewer (partner if |balance| > T);
//  - client/admin cannot create or approve;
//  - approved rows are immutable (supersede or approver-revert only);
//  - frozen return => 409.

const CREATOR_ROLES = new Set(["preparer", "reviewer", "partner", "quality_reviewer"]);
const REVIEWER_ROLES = new Set(["reviewer", "partner", "quality_reviewer"]);
const PARTNER_ROLES = new Set(["partner"]);

export type Action = "propose" | "review" | "approve" | "reject" | "revert";

export interface AuthResult {
  ok: boolean;
  code?: 403 | 409 | 422;
  error?: string;
  patch?: Partial<Adjustment>;
}

/** Partner-review money threshold (cents). Read from firm standards, not hardcoded. */
export function thresholdCents(model: PacketModel): bigint {
  const std = (model.raw.firm as Record<string, unknown>).starter_standards as Record<string, unknown> | undefined;
  const vr = std?.variance_review as Record<string, unknown> | undefined;
  const amt = typeof vr?.and_over_amount === "number" ? vr.and_over_amount : 1000;
  return BigInt(Math.round(amt * 100));
}

function abs(x: bigint): bigint {
  return x < 0n ? -x : x;
}

export function isPaymentOnly(e: Effects): boolean {
  return e.taxFed === 0n && e.taxCa === 0n && (e.payFed !== 0n || e.payCa !== 0n);
}

export function balanceMagnitude(e: Effects): bigint {
  const bFed = abs(e.taxFed - e.payFed);
  const bCa = abs(e.taxCa - e.payCa);
  return bFed > bCa ? bFed : bCa;
}

/** Does this adjustment require partner sign-off (vs reviewer)? */
export function requiresPartner(e: Effects, threshold: bigint): boolean {
  if (isPaymentOnly(e)) return balanceMagnitude(e) > threshold;
  return abs(e.taxFed) > threshold || abs(e.taxCa) > threshold;
}

export function authorize(
  action: Action,
  adj: Adjustment,
  actor: ActorRef,
  model: PacketModel,
  opts: { frozen?: boolean } = {},
): AuthResult {
  if (opts.frozen) return { ok: false, code: 409, error: "Frozen: the return is filed. Amend on top." };

  // Client and admin can never create or move adjustments.
  if (actor.role === "client" || actor.role === "firm_administrator") {
    return { ok: false, code: 403, error: `Role '${actor.role}' cannot act on adjustments.` };
  }

  const T = thresholdCents(model);
  const needsPartner = requiresPartner(adj.effects, T);

  switch (action) {
    case "propose": {
      if (!CREATOR_ROLES.has(actor.role)) return { ok: false, code: 403, error: `Role '${actor.role}' cannot propose.` };
      if (adj.status !== "draft" && adj.status !== "proposed")
        return { ok: false, code: 422, error: `Cannot propose from status '${adj.status}'.` };
      return { ok: true, patch: { status: "proposed", preparedBy: adj.preparedBy ?? actor.id } };
    }

    case "review": {
      if (!REVIEWER_ROLES.has(actor.role)) return { ok: false, code: 403, error: `Role '${actor.role}' cannot review.` };
      if (adj.status !== "proposed") return { ok: false, code: 422, error: `Cannot review from status '${adj.status}'.` };
      if (actor.id === adj.preparedBy)
        return { ok: false, code: 403, error: "A person may not review work they prepared." };
      return { ok: true, patch: { status: "reviewed", reviewedBy: actor.id } };
    }

    case "approve": {
      if (adj.status !== "proposed" && adj.status !== "reviewed")
        return { ok: false, code: 422, error: `Cannot approve from status '${adj.status}'.` };
      if (actor.id === adj.preparedBy)
        return { ok: false, code: 403, error: "A person may not approve work they prepared." };
      if (actor.id === adj.reviewedBy)
        return { ok: false, code: 403, error: "A person may not both review and approve the same item." };

      if (needsPartner) {
        if (!PARTNER_ROLES.has(actor.role))
          return {
            ok: false,
            code: 403,
            error: `Partner sign-off required: |tax/balance effect| exceeds the firm threshold.`,
          };
        if (!adj.reviewedBy)
          return { ok: false, code: 422, error: "Reviewer sign-off is required before partner approval." };
      } else {
        if (!REVIEWER_ROLES.has(actor.role))
          return { ok: false, code: 403, error: `Reviewer or partner approval required.` };
      }
      return { ok: true, patch: { status: "approved", approvedBy: actor.id, approvedAt: new Date().toISOString() } };
    }

    case "reject": {
      if (!REVIEWER_ROLES.has(actor.role)) return { ok: false, code: 403, error: `Role '${actor.role}' cannot reject.` };
      if (adj.status !== "proposed" && adj.status !== "reviewed")
        return { ok: false, code: 422, error: `Cannot reject from status '${adj.status}'.` };
      if (actor.id === adj.preparedBy)
        return { ok: false, code: 403, error: "A person may not reject their own work." };
      return { ok: true, patch: { status: "rejected" } };
    }

    case "revert": {
      if (adj.status !== "approved") return { ok: false, code: 422, error: "Only an approved adjustment can be reverted." };
      if (actor.id !== adj.approvedBy)
        return { ok: false, code: 403, error: "Only the approver may reopen an approved adjustment." };
      return { ok: true, patch: { status: "reverted" } };
    }

    default:
      return { ok: false, code: 422, error: "Unknown action." };
  }
}
