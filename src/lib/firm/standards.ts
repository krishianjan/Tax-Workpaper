import type { PacketModel } from "../packet/model";

// 7.1 Firm-wide standards, versioned. StandardContent is the normalized,
// JSON-serializable shape we persist per version (no bigint — amounts are whole
// dollars; use the *Cents accessors for math). An admin edit creates a new
// version; re-evaluation under a new version is always explicit (see
// reclassifyImpact), so a past approval is never silently re-graded.

export interface StandardContent {
  verificationTypes: string[];
  variance: { compareTo: string; flagIfChangeOverPercent: number; andOverAmount: number };
  reviewLevels: string[];
  rules: string[];
  requiredSteps: string[];
  /** Any adjustment whose |fed| OR |CA| effect exceeds this (dollars) needs partner sign-off. */
  partnerThreshold: number;
  retentionYears: number;
  /** Confidence below this routes an extracted value to needs_human. */
  confidenceThreshold: number;
  resignOn: "amounts" | "amounts_and_identity";
}

export interface VersionedStandard extends StandardContent {
  version: number;
  createdBy?: string | null;
  note?: string | null;
}

export const PARTNER_THRESHOLD_DEFAULT = 1000;
export const RETENTION_YEARS_DEFAULT = 7;
export const CONFIDENCE_THRESHOLD_DEFAULT = 0.6;

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

/** Build version 1 of the standards from the packet's firm.starter_standards.
 *  The prose rules name the thresholds; we pin them as structured defaults. */
export function seedFromPacket(model: PacketModel): StandardContent {
  const firm = model.raw.firm as Record<string, unknown>;
  const s = (firm.starter_standards ?? {}) as Record<string, unknown>;
  const variance = (s.variance_review ?? {}) as Record<string, unknown>;
  const resignOn = s.resign_on === "amounts_and_identity" ? "amounts_and_identity" : "amounts";
  return {
    verificationTypes: asStringArray(s.verification_types),
    variance: {
      compareTo: String(variance.compare_to ?? "prior_year"),
      flagIfChangeOverPercent: Number(variance.flag_if_change_over_percent ?? 10),
      andOverAmount: Number(variance.and_over_amount ?? 1000),
    },
    reviewLevels: asStringArray(s.review_levels),
    rules: asStringArray(s.rules),
    requiredSteps: asStringArray(s.required_steps),
    partnerThreshold: PARTNER_THRESHOLD_DEFAULT,
    retentionYears: RETENTION_YEARS_DEFAULT,
    confidenceThreshold: CONFIDENCE_THRESHOLD_DEFAULT,
    resignOn,
  };
}

export function partnerThresholdCents(std: StandardContent): bigint {
  return BigInt(Math.round(std.partnerThreshold * 100));
}

/** The review level an item needs, given its largest single-jurisdiction effect. */
export function requiredLevel(std: StandardContent, maxEffectCents: bigint): "reviewer" | "partner" {
  const m = maxEffectCents < 0n ? -maxEffectCents : maxEffectCents;
  return m > partnerThresholdCents(std) ? "partner" : "reviewer";
}

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

/** A field-level diff between two standards versions (for the admin audit). */
export function diffStandards(a: StandardContent, b: StandardContent): FieldChange[] {
  const out: FieldChange[] = [];
  const push = (field: string, from: unknown, to: unknown) => {
    if (JSON.stringify(from) !== JSON.stringify(to)) out.push({ field, from, to });
  };
  push("partnerThreshold", a.partnerThreshold, b.partnerThreshold);
  push("retentionYears", a.retentionYears, b.retentionYears);
  push("confidenceThreshold", a.confidenceThreshold, b.confidenceThreshold);
  push("resignOn", a.resignOn, b.resignOn);
  push("variance.flagIfChangeOverPercent", a.variance.flagIfChangeOverPercent, b.variance.flagIfChangeOverPercent);
  push("variance.andOverAmount", a.variance.andOverAmount, b.variance.andOverAmount);
  push("verificationTypes", a.verificationTypes, b.verificationTypes);
  push("reviewLevels", a.reviewLevels, b.reviewLevels);
  push("rules", a.rules, b.rules);
  push("requiredSteps", a.requiredSteps, b.requiredSteps);
  return out;
}

export interface GradedItem {
  id: string;
  maxEffectCents: bigint;
  approvedBy?: string | null;
}

export interface ReclassifiedItem {
  id: string;
  from: "reviewer" | "partner";
  to: "reviewer" | "partner";
  maxEffectCents: bigint;
}

/** Which already-graded items WOULD change required level under newStd. This is
 *  shown to the admin; it never re-writes an approval on its own. */
export function reclassifyImpact(
  oldStd: StandardContent,
  newStd: StandardContent,
  items: GradedItem[],
): ReclassifiedItem[] {
  const out: ReclassifiedItem[] = [];
  for (const it of items) {
    const from = requiredLevel(oldStd, it.maxEffectCents);
    const to = requiredLevel(newStd, it.maxEffectCents);
    if (from !== to) out.push({ id: it.id, from, to, maxEffectCents: it.maxEffectCents });
  }
  return out;
}
