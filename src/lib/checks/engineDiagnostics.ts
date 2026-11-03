import type { Check, CheckResult } from "./types";
import { makeFinding } from "./types";

// Import engine diagnostics as info-level items linked to our checks (don't
// duplicate). v3 carries 11. They corroborate our independent findings
// (e.g. BROKER_SUMMARY_DETAIL_MISMATCH, DIGITAL_ASSET_BASIS_MISSING) rather than
// replace them.

export const engineDiagnostics: Check = {
  id: "ENGINE_DIAGNOSTICS",
  title: "Engine diagnostics (imported, linked)",
  area: "Diagnostics",
  secondSource: "engine_diagnostic",
  run({ model, versionId }): CheckResult[] {
    const v = model.versionById.get(versionId);
    if (!v) return [];
    return v.diagnostics.map((d) =>
      makeFinding({
        checkId: this.id,
        title: `${d.code}: ${d.message.slice(0, 80)}`,
        area: "Diagnostics",
        secondSource: "engine_diagnostic",
        status: "info",
        refs: [...d.refs],
        primaryRefs: [`${versionId}:diag:${d.code}`],
        explanation: `[${d.severity}] ${d.message}`,
      }),
    );
  },
};
