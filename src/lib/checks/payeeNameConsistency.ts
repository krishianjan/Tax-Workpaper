import type { Check, CheckResult } from "./types";
import { makeFinding } from "./types";
import { linesOf } from "./helpers";

// Patch v1.1 §4. Provider/payee name + EIN vs document vs prior year. v3
// F2441.1a names "Bright Oak Preschool" (EIN 68-0412257), but D61 and the 2024
// return say "Bright Oak Kids Club". Same EIN, different name → flag.

function digits(s: string): string {
  return s.replace(/\D/g, "");
}

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export const payeeNameConsistency: Check = {
  id: "PAYEE_NAME_CONSISTENCY",
  title: "Provider/payee name consistency (same EIN)",
  area: "Identity",
  secondSource: "prior_year",
  run({ model, versionId }): CheckResult[] {
    const out: CheckResult[] = [];

    // Build an EIN -> document-name map from extracted EINs.
    const einToDoc = new Map<string, { docId: string; name: string }>();
    for (const doc of model.documents) {
      for (const e of model.evsByDoc.get(doc.id) ?? []) {
        if (e.value_type === "ein") {
          const name = (doc.title.split(/ - |,/)[0] ?? doc.issuer ?? doc.title).trim();
          einToDoc.set(digits(String(e.value)), { docId: doc.id, name });
        }
      }
    }

    // Prior-year provider string: "Name, EIN".
    const priorLines = ((model.raw.prior_years as Record<string, unknown>).return_2024 as Record<string, unknown>)
      ?.lines as Record<string, unknown> | undefined;
    const priorProvider = priorLines ? String(priorLines["F2441.provider"] ?? "") : "";
    const priorName = priorProvider.split(/,/)[0]?.trim() ?? "";
    const priorEin = digits(priorProvider);

    for (const ln of linesOf(model, versionId)) {
      if (ln.form !== "F2441") continue;
      const m = (ln.label ?? "").match(/provider:\s*(.+?),\s*tax id\s*([\d-]+)/i);
      if (!m) continue;
      const engineName = m[1].trim();
      const ein = digits(m[2]);

      const doc = einToDoc.get(ein);
      const docMismatch = doc && norm(doc.name) !== norm(engineName);
      const priorMismatch = priorEin === ein && priorName && norm(priorName) !== norm(engineName);

      if (docMismatch || priorMismatch) {
        const refs = [ln.key, ...ln.sources];
        if (doc) refs.push(doc.docId);
        out.push(
          makeFinding({
            checkId: this.id,
            title: `${ln.key}: provider name differs from the source (same EIN)`,
            area: this.area,
            secondSource: this.secondSource,
            status: "warn",
            expected: doc?.name ?? priorName,
            actual: engineName,
            delta: null,
            refs,
            primaryRefs: [`${versionId}:${ln.key}`],
            explanation: `The return names the provider "${engineName}" (EIN ${m[2]}), but ${doc ? `${doc.docId} says "${doc.name}"` : ""}${doc && priorMismatch ? " and " : ""}${priorMismatch ? `the 2024 return says "${priorName}"` : ""}. Same EIN, different name — reconcile.`,
          }),
        );
      }
    }
    return out;
  },
};
