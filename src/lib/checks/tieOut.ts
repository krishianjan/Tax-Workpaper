import type { Check, CheckResult } from "./types";
import { makeFinding } from "./types";
import { line, linesOf, lineValueCents } from "./helpers";
import { toCents, type Cents } from "../money";

// Feature 8. Records must reconcile to the return lines they summarize; a failed
// tie-out is itself a CheckResult so no one has to catch it by eye. These are
// internal cross-line reconciliations computed from the engine lines (a second
// view of the same return): sub-lines must sum to the roll-up line.

interface TieSpec {
  label: string;
  total: string; // the roll-up line key
  parts?: string[]; // explicit part keys …
  partPrefix?: string; // … or every line whose key starts with this
}

const TIES: TieSpec[] = [
  { label: "Taxable interest", total: "F1040.2b", partPrefix: "SchB.1." },
  { label: "Capital gain or (loss)", total: "F1040.7", parts: ["SchD.16"] },
  { label: "Total wages", total: "F1040.1z", parts: ["F1040.1a"] },
];

export const tieOutCheck: Check = {
  id: "TIE_OUT",
  title: "Record subtotals tie to the return lines",
  area: "Arithmetic integrity",
  secondSource: "engine_internal",
  run({ model, versionId }): CheckResult[] {
    const out: CheckResult[] = [];
    for (const spec of TIES) {
      const totalLn = line(model, versionId, spec.total);
      if (!totalLn) continue;
      const totalCents = lineValueCents(totalLn) ?? 0n;

      let partKeys: string[] = spec.parts ?? [];
      if (spec.partPrefix) partKeys = linesOf(model, versionId).filter((l) => l.key.startsWith(spec.partPrefix!)).map((l) => l.key);

      let sum: Cents = 0n;
      for (const k of partKeys) sum += toCents(line(model, versionId, k)?.value) ?? 0n;

      const delta = sum - totalCents;
      const ties = delta === 0n;
      out.push(
        makeFinding({
          checkId: this.id,
          title: ties ? `${spec.label} ties to ${spec.total}` : `${spec.label} does NOT tie to ${spec.total}`,
          area: this.area,
          secondSource: this.secondSource,
          status: ties ? "pass" : "fail",
          expected: Number(totalCents) / 100,
          actual: Number(sum) / 100,
          delta,
          taxEffectFed: 0n,
          taxEffectCa: 0n,
          refs: [spec.total, ...partKeys],
          primaryRefs: [spec.total],
          explanation: ties
            ? `${partKeys.length} part line(s) sum to ${(Number(sum) / 100).toLocaleString()}, matching ${spec.total}.`
            : `Parts sum to ${(Number(sum) / 100).toLocaleString()} but ${spec.total} = ${(Number(totalCents) / 100).toLocaleString()} (Δ ${(Number(delta) / 100).toLocaleString()}).`,
        }),
      );
    }
    return out;
  },
};
