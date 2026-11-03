import type { Check, CheckResult } from "./types";
import { makeFinding } from "./types";

// Recompute the line diffs between the previous version and this one, and
// compare to the engine's stated changes_from_previous. Reports any key where
// our recomputed diff disagrees with the engine's changelog.

export const versionDiff: Check = {
  id: "VERSION_DIFF",
  title: "Recomputed version diff vs the engine changelog",
  area: "Arithmetic integrity",
  secondSource: "engine_internal",
  run({ model, versionId }): CheckResult[] {
    const idx = model.versions.findIndex((v) => v.version === versionId);
    if (idx <= 0) return [];
    const prev = model.versions[idx - 1];
    const cur = model.versions[idx];

    const prevLines = model.lineByVersionKey.get(prev.version)!;
    const curLines = model.lineByVersionKey.get(cur.version)!;
    const keys = new Set<string>([...prevLines.keys(), ...curLines.keys()]);

    type Diff = { key: string; change: "added" | "changed" | "removed"; old?: unknown; new?: unknown };
    const recomputed = new Map<string, Diff>();
    for (const key of keys) {
      const a = prevLines.get(key);
      const b = curLines.get(key);
      if (a && !b) recomputed.set(key, { key, change: "removed", old: a.value });
      else if (!a && b) recomputed.set(key, { key, change: "added", new: b.value });
      else if (a && b && JSON.stringify(a.value) !== JSON.stringify(b.value))
        recomputed.set(key, { key, change: "changed", old: a.value, new: b.value });
    }

    const stated = new Map<string, unknown>();
    for (const c of cur.changes_from_previous) stated.set(String((c as Record<string, unknown>).key), c);

    const out: CheckResult[] = [];
    // Keys we found that the engine did not list, and vice versa.
    const missingFromChangelog = [...recomputed.keys()].filter((k) => !stated.has(k));
    const extraInChangelog = [...stated.keys()].filter((k) => !recomputed.has(k));

    if (missingFromChangelog.length === 0 && extraInChangelog.length === 0) {
      out.push(
        makeFinding({
          checkId: this.id,
          title: `${prev.version} → ${cur.version} changelog reconciles`,
          area: this.area,
          secondSource: this.secondSource,
          status: "info",
          actual: `${recomputed.size} changes`,
          refs: [cur.version],
          primaryRefs: [`${cur.version}:changelog`],
          explanation: `Recomputed ${recomputed.size} line changes; all are present in changes_from_previous.`,
        }),
      );
    } else {
      out.push(
        makeFinding({
          checkId: this.id,
          title: `${prev.version} → ${cur.version} changelog disagrees with recomputed diff`,
          area: this.area,
          secondSource: this.secondSource,
          status: "warn",
          expected: `${stated.size} stated`,
          actual: `${recomputed.size} recomputed`,
          refs: [cur.version, ...missingFromChangelog.slice(0, 10), ...extraInChangelog.slice(0, 10)],
          primaryRefs: [`${cur.version}:changelog`],
          explanation: `Keys changed but not in changelog: ${missingFromChangelog.join(", ") || "none"}. Keys in changelog but unchanged: ${extraInChangelog.join(", ") || "none"}.`,
        }),
      );
    }
    return out;
  },
};
