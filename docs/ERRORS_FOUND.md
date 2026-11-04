# Errors found

Generated from the independent checks, then **grouped into Issues** (Block 2):
one real-world problem may be flagged by several checks. **~17 return-affecting
issues** on v3 (we did not target a count). Tax and payment effects are kept
separate.

**Final Δ (the 8 return-error rows + 2 payment rows, incl. the two Block-4
cross-source errors), to the cent:**
federal tax **−$18,830.16**, California tax **−$3,040.83**,
federal balance **−$17,830.16**, California balance **+$459.17**
(federal payment +$1,000 owed; CA payment +$3,500 owed). Judgment items (CA wage
split, C6, phone/internet, Spotify, HVAC) and compliance items (nondeductible
SEP, basis gaps) are listed but excluded until approved / resolved.

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
| Donated Subaru: client estimate $6,000 vs 1098-C gross proceeds $2,900 (D66) | `CLIENT_ESTIMATE_VS_THIRD_PARTY` | itemized −3,100; fed +$806.00, CA +$148.80 |
| Same 1,840 sweep interest on D28 (Northlake Securities) and D29 (Northlake Bank), account 7731 | `CROSS_FORM_DUPLICATE_INCOME` | interest −1,840; fed −$640.32, CA −$126.96 |
| Sparbanken interest (SEK 18,450) converted at the 2024 rate 10.56 instead of the 2025 rate 9.86 | `FX_RATE_PERIOD` | 1,747 → 1,871; Δ +124; fed +$43.15, CA +$8.56 |

## (b) Judgment calls (listed, not auto-applied)
| Item | Why it's judgment |
|---|---|
| State-source wage split (D73 Austin work location vs all-CA wages 218,400) | payroll reporting vs work location vs residency — preparer decides (`STATE_SOURCE_WAGES`) |
| Coinhaven C6 basis (transferred-in crypto; msg evidence ≈ $3,050, bank line pending) | blocked pending client evidence (`MISSING_OR_ZERO_BASIS`) |
| qa-14 "no investments sold" vs the actual sales | correct the questionnaire with the client (`QUESTIONNAIRE_VS_DOCS`) |
| Phone 70% / internet 50% business use (call-01) vs 100% claimed | suggested SchC.25 $2,172 (`BUSINESS_USE_FROM_EVIDENCE`) |
| Spotify Family $216 booked to the business (call-01, personal) | suggested removal from SchC.27a.1 (`PERSONAL_IN_BUSINESS`) |

## (c) Scope / compliance items outside the return
| Item | Note |
|---|---|
| FBAR (FinCEN 114) | Swedish account > $10,000; filed separately (`FBAR_OUTSIDE_RETURN`) |
| 1099 filing obligation | Sch C paid two contractors ≥ $600 (`FORM_1099_FILING`) |
| Due diligence (Form 8867) | CTC/ODC/AOTC/HOH (`DUE_DILIGENCE_REQUIRED`) |
| California AMT (Sch P 540NR) not computed | ISO exercise (`CA_AMT_NOT_COMPUTED`) |
| SEP contribution 2,786 nondeductible for 2025 (D26) | excise / corrective action — CPA to determine (`NONDEDUCTIBLE_CONTRIBUTION`) |
| Ridgeline outside basis never computed; S-corp 2023/2024 stock basis null | reconstruct before relying on a loss/gain (`BASIS_GAP`) |
| HVAC 11,000 inside SchE.14A repairs | repair vs improvement judgment (`EXPENSE_CLASSIFICATION_NOTE`) |

## Arithmetic integrity
`SUM_RECOMPUTE` re-adds 93 summed lines. Differences are legitimate subtotals
that subtract (net profit, AGI). Reported at info level, triaged in DECISIONS.md
(D9) — not return errors.

## Integrity results (this import)
- Documents: **74** · Pages: **199** · Extracted values: **3,012** · Versions: **3** · Lines: **1,877**
- Dispositions: **74/74 accounted**, 0 unaccounted · Unresolved references: **0**
- Checks: **27** (incl. `CROSS_FORM_DUPLICATE_INCOME`, `FX_RATE_PERIOD`, `NONDEDUCTIBLE_CONTRIBUTION`, `BASIS_GAP`, `TAX_COMPUTATION_RECOMPUTE`, `TIE_OUT`) · every finding has a stable id; re-running is idempotent
- 17 CPA records (`/records`), each with a mode switch, linked numbers and a tie-out footer · 192 tests green
