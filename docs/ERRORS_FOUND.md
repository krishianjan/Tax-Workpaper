# Errors found

Generated from the independent checks (`CheckResult` rows) run on v3. 259
findings: 133 info, 71 warn, 55 fail. Grouped per patch v1.1 §11. We did not
target an error count — these fall out of generic checks.

**Workpaper preview Δ tax (failing, auto-applied): federal −$19,857.01,
California +$270.23.**

## (a) Errors that change the return

| Finding | Check | Δ / tax effect |
|---|---|---|
| RSU lots N1/N3/N4 basis 0; supplemental D11 basis 19,100 / 19,100 / 9,420 not applied | `MISSING_OR_ZERO_BASIS` | gain −47,620; fed ≈ −$15,536 (stcg+ltcg); CA split by sale date |
| Schedule C gross receipts double-count the Paywell 1099-K (inside the books) | `THIRD_PARTY_VS_BOOKS` | SchC.1 151,300 vs 163,700; Δ −12,400; fed −$4,402 |
| Car & truck expense built on a duplicated mileage page (D23 p3=p2) | `DUPLICATE_PAGE` | SchC.9 8,260 → 5,670; Δ −2,590; fed −$919 |
| Federal estimates trust qa-41 ($4,000) over the IRS transcript ($3,000) | `PAYMENTS_VS_AGENCY` | F1040.26 13,000 → 12,000; +$1,000 owed |
| CA estimates include a 2025-09-15 payment designated to 2024 (D68) | `PAYMENTS_VS_AGENCY` | F540NR.72 14,000 → 10,500; +$3,500 owed (CA) |
| Childcare provider EIN read `74-3829516`, page prints `74-3829156` | `VALUE_VS_PRINT` | identity fix; blocks the F2441 provider match |
| M18 Ironwood REIT (D31 p32) missing from Form 8949 | `PARTIAL_EXTRACTION` / `BROKER_SUMMARY_VS_DETAIL` | proceeds 250 gap |
| Theo SSN `666-74-3309` vs 2024 return `666-74-3390` | `IDENTITY_CONSISTENCY` | must fix before e-file |
| Provider named "Bright Oak Preschool" vs "Bright Oak Kids Club" (same EIN) | `PAYEE_NAME_CONSISTENCY` | name reconciliation |
| AGI 228,409 → 445,590 (and other swings) | `PRIOR_YEAR_VARIANCE` | explain the swing |

## (b) Judgment calls (listed, not auto-applied)
| Item | Why it's judgment |
|---|---|
| State-source wage split (D73 Austin work location vs all-CA wages 218,400) | payroll reporting vs work location vs residency — preparer decides (`STATE_SOURCE_WAGES`) |
| Coinhaven C6 basis (transferred-in crypto; msg evidence ≈ $3,050, bank line pending) | blocked pending client evidence (`MISSING_OR_ZERO_BASIS`) |
| qa-14 "no investments sold" vs the actual sales | correct the questionnaire with the client (`QUESTIONNAIRE_VS_DOCS`) |

## (c) Scope / compliance items outside the return
| Item | Note |
|---|---|
| FBAR (FinCEN 114) | Swedish account > $10,000; filed separately (`FBAR_OUTSIDE_RETURN`) |
| 1099 filing obligation | Sch C paid two contractors ≥ $600 (`FORM_1099_FILING`) |
| Due diligence (Form 8867) | CTC/ODC/AOTC/HOH (`DUE_DILIGENCE_REQUIRED`) |
| California AMT (Sch P 540NR) not computed | ISO exercise (`CA_AMT_NOT_COMPUTED`) |

## Arithmetic integrity
`SUM_RECOMPUTE` re-adds 93 summed lines. Differences are legitimate subtotals
that subtract (net profit, AGI). Reported at info level, triaged in DECISIONS.md
(D9) — not return errors.

## Integrity results (this import)
- Documents: **74** · Pages: **199** · Extracted values: **3,012** · Versions: **3** · Lines: **1,877**
- Dispositions: **74/74 accounted**, 0 unaccounted · Unresolved references: **0**
- Checks: **17** · Findings: **259** (55 fail / 71 warn / 133 info) · every finding has a stable id; re-running is idempotent
