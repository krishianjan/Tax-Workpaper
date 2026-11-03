import type { PacketModel } from "./packet/model";

// Prior-year crosswalk (patch v1.1 §3). 2024 was a full-year CA return
// (CA540.* keys); 2025 is part-year (F540NR.*, SchCA540NR.*). Some federal keys
// also drift (2024 F8938 vs 2025 F8938.1.max; SchC.27a split into .1/.2;
// F2441.provider split into 1a/1b). Maps each 2024 key to a 2025 key, a drifted
// key, or no_counterpart with a reason.

export type CrosswalkStatus = "matched" | "drifted" | "no_counterpart";

export interface CrosswalkEntry {
  key2024: string;
  key2025: string | null;
  status: CrosswalkStatus;
  reason: string;
}

// Known federal drifts where the line was split or renamed in 2025.
const DRIFT: Record<string, { to: string[]; reason: string }> = {
  "SchC.27a": { to: ["SchC.27a.1", "SchC.27a.2"], reason: "Other expenses split into itemized sub-lines in 2025." },
  "F2441.provider": { to: ["F2441.1a", "F2441.1b"], reason: "Single provider line split per-provider (1a/1b) in 2025." },
  "F8938": { to: ["F8938.1.max"], reason: "Renamed to the per-account maximum key in 2025." },
  "F8995.15": { to: ["F8995A.15", "F8995.A.15"], reason: "QBI moved from Form 8995 to 8995-A." },
};

export function buildCrosswalk(model: PacketModel, versionId = "v3"): CrosswalkEntry[] {
  const prior = (model.raw.prior_years as Record<string, unknown>).return_2024 as Record<string, unknown> | undefined;
  const lines2024 = (prior?.lines ?? {}) as Record<string, unknown>;
  const v3Keys = model.lineByVersionKey.get(versionId) ?? new Map();

  const out: CrosswalkEntry[] = [];
  for (const key of Object.keys(lines2024)) {
    if (v3Keys.has(key)) {
      out.push({ key2024: key, key2025: key, status: "matched", reason: "Same key in 2025." });
      continue;
    }
    const drift = DRIFT[key];
    if (drift) {
      const found = drift.to.find((k) => v3Keys.has(k));
      if (found) {
        out.push({ key2024: key, key2025: found, status: "drifted", reason: drift.reason });
        continue;
      }
      out.push({ key2024: key, key2025: null, status: "no_counterpart", reason: drift.reason });
      continue;
    }
    if (key.startsWith("CA540")) {
      out.push({
        key2024: key,
        key2025: null,
        status: "no_counterpart",
        reason: "2024 was full-year California (CA540); 2025 is part-year (Form 540NR / Schedule CA 540NR) — no 1:1 line.",
      });
      continue;
    }
    out.push({
      key2024: key,
      key2025: null,
      status: "no_counterpart",
      reason: "No 2025 line with this key; line removed, zeroed, or restructured.",
    });
  }
  return out;
}

export function unmatchedPriorYear(model: PacketModel, versionId = "v3"): CrosswalkEntry[] {
  return buildCrosswalk(model, versionId).filter((e) => e.status === "no_counterpart");
}
