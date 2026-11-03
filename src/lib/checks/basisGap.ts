import type { Check, CheckResult } from "./types";
import { makeFinding } from "./types";

// Step-0 check (scope / open item). Basis that was never computed cannot be
// relied on and must be surfaced as an Issue, not silently treated as zero:
//   - Ridgeline (D37) outside_basis was never computed
//     (prior_years.basis_records.partnership_ridgeline[].outside_basis = null)
//   - S corp (D40) ending_stock_basis is null for 2023 and 2024
//     (prior_years.basis_records.scorp_lindqvist_family_woodworks)
// No return tax effect (judgment=true); the CPA must obtain/compute the basis.

interface BasisRow {
  [k: string]: unknown;
}

export const basisGap: Check = {
  id: "BASIS_GAP",
  title: "Basis never computed — open item",
  area: "Completeness",
  secondSource: "prior_year",
  run({ model }): CheckResult[] {
    const out: CheckResult[] = [];
    const records = (model.raw as unknown as { prior_years?: { basis_records?: Record<string, BasisRow[]> } })
      .prior_years?.basis_records;
    if (!records) return out;

    const ridgeline = records["partnership_ridgeline"] ?? [];
    for (const row of ridgeline) {
      if (row.outside_basis === null || row.outside_basis === undefined) {
        out.push(
          makeFinding({
            checkId: this.id,
            title: `Ridgeline (D37) outside basis never computed (${row.year ?? "?"})`,
            area: this.area,
            secondSource: this.secondSource,
            status: "warn",
            judgment: true,
            delta: null,
            taxEffectFed: 0n,
            taxEffectCa: 0n,
            refs: ["D37", "py:/basis_records/partnership_ridgeline"],
            primaryRefs: ["D37"],
            explanation:
              `prior_years.basis_records.partnership_ridgeline shows outside_basis = null for ${row.year ?? "?"} ` +
              `(${String(row.source ?? "")}). Outside basis limits deductible losses and the gain on disposal; ` +
              `it must be reconstructed before the K-1 loss/limitation is relied on. CPA to compute.`,
          }),
        );
      }
    }

    const scorp = records["scorp_lindqvist_family_woodworks"] ?? [];
    for (const row of scorp) {
      if (row.ending_stock_basis === null || row.ending_stock_basis === undefined) {
        out.push(
          makeFinding({
            checkId: this.id,
            title: `S corp (D40) ending stock basis missing (${row.year ?? "?"})`,
            area: this.area,
            secondSource: this.secondSource,
            status: "warn",
            judgment: true,
            delta: null,
            taxEffectFed: 0n,
            taxEffectCa: 0n,
            refs: ["D40", "py:/basis_records/scorp_lindqvist_family_woodworks"],
            primaryRefs: ["D40", `scorp:${row.year ?? "?"}`],
            explanation:
              `prior_years.basis_records.scorp_lindqvist_family_woodworks shows ending_stock_basis = null for ` +
              `${row.year ?? "?"} (${String(row.source ?? "")}). The stock-basis ledger has a gap, so the 2025 ` +
              `distribution/loss limitation and any excess-distribution gain cannot be confirmed. CPA to reconstruct.`,
          }),
        );
      }
    }
    return out;
  },
};
