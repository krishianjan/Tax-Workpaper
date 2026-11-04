// The 17 records a CPA expects (Feature 8). Each is a generated view over the
// effective data. `implemented` flips on as records are built, so the index and
// the dispatcher stay honest about what exists.

export interface RecordDef {
  num: number;
  slug: string;
  title: string;
  blurb: string;
  implemented: boolean;
}

export const RECORDS: RecordDef[] = [
  { num: 1, slug: "summary-vs-last-year", title: "Return summary vs last year", blurb: "2024 (crosswalked) vs 2025 engine vs final, with each swing's explanation.", implemented: true },
  { num: 2, slug: "tax-computation", title: "Tax computation", blurb: "Taxable income → regular tax → AMT → credits → other taxes → total, recomputed independently.", implemented: true },
  { num: 3, slug: "area-summaries", title: "Area summaries", blurb: "One page per area: lines, issues, adjustments, decisions, sign-offs, time, readiness.", implemented: true },
  { num: 4, slug: "document-index", title: "Document index", blurb: "74 documents, disposition, received, where used, verification stats; expected-but-missing listed.", implemented: true },
  { num: 5, slug: "depreciation", title: "Depreciation by asset", blurb: "Every asset: method, life, federal/CA/AMT, CA basis differences, disposals (F4797).", implemented: true },
  { num: 6, slug: "sales-detail", title: "Sales detail", blurb: "Every 8949 lot (exceptions-first), crypto, F4797 sale, S-corp excess distribution.", implemented: true },
  { num: 7, slug: "books-to-tax", title: "Books to tax", blurb: "Book figures plus approved adjustments (1099-K, mileage, phone/internet, Spotify).", implemented: true },
  { num: 8, slug: "rentals", title: "Rentals and passive losses", blurb: "Schedule E by property, F8582, prior suspended losses released and why.", implemented: true },
  { num: 9, slug: "k1-lines", title: "K-1 lines", blurb: "Ridgeline 1065 (+ state supplement), Woodworks 1120-S; each box → line → evidence.", implemented: true },
  { num: 10, slug: "retirement", title: "Retirement", blurb: "Backdoor Roth (F8606), SEP with nondeductible, 401(k), HSA (CA addback).", implemented: false },
  { num: 11, slug: "foreign", title: "Foreign", blurb: "Sparbanken interest (FX used vs correct), F8938, FBAR, Form 3520, foreign tax paid.", implemented: false },
  { num: 12, slug: "deductions-credits", title: "Deductions and credits with limits", blurb: "SALT cap, mortgage interest, charity, dependent care, CTC/ODC, AOTC, QBI.", implemented: false },
  { num: 13, slug: "payments", title: "Payments", blurb: "Withholding by W-2, estimates by designated year, extension, agency reconciliation.", implemented: true },
  { num: 14, slug: "state-split", title: "State split", blurb: "CA-source income per item, wage-sourcing decision, Ridgeline CA share.", implemented: false },
  { num: 15, slug: "carryovers", title: "Carryovers", blurb: "Into 2025 (vs 2024 return + D07) → used → out to 2026, with provenance.", implemented: true },
  { num: 16, slug: "basis-by-year", title: "Basis by year", blurb: "S-corp ledger 2022–2025, Ridgeline capital vs outside basis, IRA basis, home.", implemented: false },
  { num: 17, slug: "prior-vs-ours", title: "Prior preparer vs what we changed", blurb: "D07 memo & open items vs our Issues/Decisions; method changes year over year.", implemented: false },
];

export function recordBySlug(slug: string): RecordDef | undefined {
  return RECORDS.find((r) => r.slug === slug);
}
