// Hand-checked expected effects (cents). Rates from v3 tax_effect_rates.
// Round half away from zero at each row, then sum the rounded rows.
// taxFed/taxCa = change in tax liability; payFed/payCa = change in payments.
// balance = tax − payments.

export interface ExpectedRow {
  issue: string;
  baseDelta: number; // dollars, signed change to the taxable base
  category: string;
  taxFed: bigint;
  taxCa: bigint;
  payFed: bigint;
  payCa: bigint;
}

export const EXPECTED: ExpectedRow[] = [
  // RSU basis N1+N3 (CA-resident sales): −38,200 stcg; CA uses ca_source_income 0.064
  // fed −38,200 × 0.348 = −13,293.60 ; ca −38,200 × 0.064 = −2,444.80
  { issue: "rsu_n1_n3", baseDelta: -38200, category: "stcg/ca_source_income", taxFed: -1329360n, taxCa: -244480n, payFed: 0n, payCa: 0n },
  // RSU basis N4 (sold 2025-08-12, TX): −9,420 ltcg; ca ltcg 0.034
  // fed −9,420 × 0.238 = −2,241.96 ; ca −9,420 × 0.034 = −320.28
  { issue: "rsu_n4", baseDelta: -9420, category: "ltcg", taxFed: -224196n, taxCa: -32028n, payFed: 0n, payCa: 0n },
  // 1099-K double count: −12,400 schc_profit
  // fed −12,400 × 0.355 = −4,402.00 ; ca −12,400 × 0.031 = −384.40
  { issue: "k1099", baseDelta: -12400, category: "schc_profit", taxFed: -440200n, taxCa: -38440n, payFed: 0n, payCa: 0n },
  // Mileage 11,800→8,100: expense down 2,590 => profit +2,590 schc_profit
  // fed +2,590 × 0.355 = +919.45 ; ca +2,590 × 0.031 = +80.29
  { issue: "mileage", baseDelta: 2590, category: "schc_profit", taxFed: 91945n, taxCa: 8029n, payFed: 0n, payCa: 0n },
  // Meridian M18 (sold 2025-12-15, TX): a 60 short-term loss => −60 stcg
  // fed −60 × 0.348 = −20.88 ; ca −60 × 0.034 = −2.04
  { issue: "m18", baseDelta: -60, category: "stcg", taxFed: -2088n, taxCa: -204n, payFed: 0n, payCa: 0n },
  // Subaru 6,000→2,900: itemized deduction down 3,100 (rates are negative)
  // fed −3,100 × −0.26 = +806.00 ; ca −3,100 × −0.048 = +148.80
  { issue: "subaru", baseDelta: -3100, category: "itemized", taxFed: 80600n, taxCa: 14880n, payFed: 0n, payCa: 0n },
  // Federal Q4 estimate 13,000→12,000: payment down 1,000 (balance +1,000 owed)
  { issue: "fed_estimate", baseDelta: 0, category: "payment", taxFed: 0n, taxCa: 0n, payFed: -100000n, payCa: 0n },
  // CA 09/15 payment designated 2024: CA payment down 3,500 (balance +3,500 owed)
  { issue: "ca_estimate", baseDelta: 0, category: "payment", taxFed: 0n, taxCa: 0n, payFed: 0n, payCa: -350000n },
];

export function expectedTotals() {
  let taxFed = 0n, taxCa = 0n, payFed = 0n, payCa = 0n;
  for (const r of EXPECTED) {
    taxFed += r.taxFed; taxCa += r.taxCa; payFed += r.payFed; payCa += r.payCa;
  }
  return { taxFed, taxCa, payFed, payCa, balanceFed: taxFed - payFed, balanceCa: taxCa - payCa };
}
