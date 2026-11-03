import { createHash } from "node:crypto";

// 5.4 Sign-offs that reopen when what was signed changes. The SCOPE decides what
// reopens. The client's 8879 covers the amount lines (+ identity only if the
// firm re-sign policy says so); reviewer/partner cover the whole return and its
// decisions. A reopened lower level invalidates the levels above it.

export type SignLevel = "preparer" | "reviewer" | "partner" | "client" | "quality";
export type SignScope = "area" | "issue" | "decision" | "return" | "form8879";
export type SignStatus = "valid" | "reopened" | "superseded";

export type ResignPolicy = "amounts" | "amounts_and_identity";

export interface SignOff {
  id: string;
  level: SignLevel;
  scope: SignScope;
  coveredRefs: string[];
  coveredHash: string;
  signedBy: string;
  signedAt: string;
  status: SignStatus;
  reopenReason?: string;
  diff?: string;
}

// The order sign-offs are taken; a reopened lower level invalidates higher ones.
export const LEVEL_ORDER: SignLevel[] = ["preparer", "reviewer", "partner", "client"];

export interface World {
  /** Final-mode summary amounts (cents) that an 8879 and return sign-offs cover. */
  amounts: { agi: bigint; totalTax: bigint; payments: bigint; balance: bigint };
  /** Hash of the e-sign identity fields (dependent SSNs, prior-year AGI, IP PIN). */
  identityHash: string;
  /** Decisions in scope: id -> a stable hash (status + selected option + dependencyHash). */
  decisionHashes: Record<string, string>;
  /** Final-mode values of specific covered lines (for area/issue/decision scopes). */
  lineValues: Record<string, unknown>;
}

function amountsString(a: World["amounts"]): string {
  return `${a.agi}|${a.totalTax}|${a.payments}|${a.balance}`;
}

/** The hash a sign-off covers, given the current world and the firm re-sign policy. */
export function coveredHashFor(signoff: Pick<SignOff, "scope" | "coveredRefs">, world: World, policy: ResignPolicy): string {
  const h = createHash("sha256");
  switch (signoff.scope) {
    case "form8879": {
      h.update("amounts:" + amountsString(world.amounts));
      if (policy === "amounts_and_identity") h.update("identity:" + world.identityHash);
      break;
    }
    case "return": {
      h.update("amounts:" + amountsString(world.amounts));
      h.update("identity:" + world.identityHash);
      const decs = Object.keys(world.decisionHashes).sort().map((k) => `${k}=${world.decisionHashes[k]}`);
      h.update("decisions:" + decs.join(","));
      break;
    }
    case "decision": {
      const decs = signoff.coveredRefs.sort().map((r) => `${r}=${world.decisionHashes[r] ?? ""}`);
      h.update("decisions:" + decs.join(","));
      break;
    }
    default: {
      // area | issue — the covered lines' final values
      const parts = signoff.coveredRefs.sort().map((r) => `${r}=${JSON.stringify(world.lineValues[r] ?? null)}`);
      h.update("lines:" + parts.join(","));
    }
  }
  return h.digest("hex").slice(0, 24);
}

export interface RecomputeResult {
  signoffs: SignOff[];
  reopenedIds: string[];
}

/**
 * Recompute every valid sign-off against the current world. A scope whose hash
 * changed is reopened with a diff; then a reopened lower level cascades to the
 * higher levels (order invalidation).
 */
export function recomputeSignOffs(signoffs: SignOff[], world: World, policy: ResignPolicy): RecomputeResult {
  const next = signoffs.map((s) => ({ ...s }));
  const reopened = new Set<string>();

  // Pass 1: direct hash mismatch.
  for (const s of next) {
    if (s.status !== "valid") continue;
    const current = coveredHashFor(s, world, policy);
    if (current !== s.coveredHash) {
      s.status = "reopened";
      s.reopenReason = "Covered content changed since signing.";
      s.diff = `${s.coveredHash} → ${current}`;
      reopened.add(s.id);
    }
  }

  // Pass 2: order invalidation WITHIN the return-approval chain only. The client
  // 8879 is scope-governed (its own amounts hash) and is NOT cascaded into — so
  // an identity-only change that reopens the reviewer/partner return sign-offs
  // does not reopen the 8879 under the `amounts` policy (the key trap).
  const chainRanks = next
    .filter((s) => reopened.has(s.id) && s.scope !== "form8879")
    .map((s) => LEVEL_ORDER.indexOf(s.level));
  const minReopenedRank = chainRanks.length ? Math.min(...chainRanks) : Number.POSITIVE_INFINITY;
  if (Number.isFinite(minReopenedRank)) {
    for (const s of next) {
      if (s.status !== "valid") continue;
      if (s.scope === "form8879") continue; // governed only by its own amounts hash
      if (LEVEL_ORDER.indexOf(s.level) > minReopenedRank) {
        s.status = "reopened";
        s.reopenReason = "A lower-level sign-off reopened.";
        reopened.add(s.id);
      }
    }
  }

  return { signoffs: next, reopenedIds: [...reopened] };
}
