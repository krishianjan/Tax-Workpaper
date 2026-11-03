import type { Check, CheckResult } from "./types";
import { makeFinding } from "./types";
import { linesOf } from "./helpers";

// Step-0 note (item 5). SchE.14A "Repairs - property A" bundles an 11,000 HVAC
// cost inside repairs ("HVAC 11,000.00 is inside repairs per the owner
// statement"). Repair vs improvement is a JUDGMENT (capitalize & depreciate, or
// deduct now). The engine already treated it as a repair, so the HVAC Decision's
// DEFAULT option equals the engine treatment. This surfaces the link; the
// Decision record carries the authority and the two options.

export const hvacInsideRepairs: Check = {
  id: "EXPENSE_CLASSIFICATION_NOTE",
  title: "HVAC cost bundled inside repairs (repair vs improvement)",
  area: "Completeness",
  secondSource: "page_text",
  run({ model, versionId }): CheckResult[] {
    const out: CheckResult[] = [];
    for (const ln of linesOf(model, versionId)) {
      const note = ln.note ?? "";
      const m = note.match(/HVAC\s+([\d,]+\.\d{2})\s+is\s+inside\s+repairs/i);
      if (!m) continue;
      out.push(
        makeFinding({
          checkId: this.id,
          title: `${ln.key}: HVAC ${m[1]} is inside repairs — repair vs improvement`,
          area: this.area,
          secondSource: this.secondSource,
          status: "info",
          judgment: true,
          delta: null,
          taxEffectFed: 0n,
          taxEffectCa: 0n,
          refs: [ln.key, "decision:hvac"],
          primaryRefs: [ln.key],
          explanation:
            `${ln.key} includes an HVAC cost of ${m[1]} classified as a repair (deducted in full) per the ` +
            `owner statement. Whether a building-system HVAC replacement is a deductible repair or a ` +
            `capitalizable improvement (§1.263(a)-3) is a judgment call. The engine already assumed "repair", ` +
            `so that is the HVAC Decision's default option; choosing "improvement" adds a depreciable asset.`,
        }),
      );
    }
    return out;
  },
};
