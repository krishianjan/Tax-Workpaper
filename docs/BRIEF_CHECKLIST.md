# Brief checklist (§6)

Each line of the brief → the route that demonstrates it → the test that proves
it → status. `npm run check` = typecheck + lint + 192 tests.

## Evidence
| Line | Route | Test | Status |
|---|---|---|---|
| Trace a number to its source field | `/line/[v]/[key]`, `/doc/[id]/p/[n]` | `evidence.test.ts` (buildRecipe) | ✅ |
| Trace a document to everywhere it landed / why not | `/doc/[id]`, Record 4 `/records/document-index` | `evidence.test.ts` (whereDocLanded) | ✅ |
| How each number was verified | `/doc/[id]`, Record 4 | `verify.test.ts` | ✅ |
| Links across return, years, related returns | `/variance`, `/compare`, crosswalk | `evidence.test.ts`, `findings.test.ts` | ✅ |
| Attach file / message / note | Attachment + AttachmentLink | `people.test.ts` (answers→evidence) | ✅ |
| Simulated docs replaceable by real ones | `render/renderer.ts` interface | — (interface) | ✅ |

## Calculation
| Line | Route | Test | Status |
|---|---|---|---|
| How a number was built | `/line/[v]/[key]` recipe | `evidence.test.ts` | ✅ |
| Reconcile figures that should agree | Record tie-out footers, `TIE_OUT` | `findings.test.ts` (TIE_OUT) | ✅ |
| Large detail without swamping | `/schedules/8949`, Record 6 (exceptions-first) | — | ✅ |
| Books → taxable income | `/schedules/books-to-tax`, Record 7 | `season-block2.test.ts` | ✅ |
| State split | `/schedules/state-split`, Record 14 | `findings.test.ts` (STATE_SOURCE_WAGES) | ✅ |
| Checks that don't trust the engine | `/checks` | `findings.test.ts` (27 checks) | ✅ |
| Independent tax recompute | Record 2 | `records.test.ts`, `findings.test.ts` (TAX_COMPUTATION_RECOMPUTE) | ✅ |

## Change
| Line | Route | Test | Status |
|---|---|---|---|
| Adjust without losing the original (who/why/effect) | `/changes` | `change.test.ts` | ✅ |
| Live changes + since-I-last-looked | `/api/events`, UserCursor | `season-block2.test.ts` (feed) | ✅ |
| Compare versions | `/compare` | `change.test.ts` | ✅ |
| What-ifs | `/what-if` | `change.test.ts` (scenario) | ✅ |
| Bulk + undo | `/changes` | `season-block2.test.ts` (batch/undo) | ✅ |

## Judgment
| Line | Route | Test | Status |
|---|---|---|---|
| Swings vs last year | Record 1 `/records/summary-vs-last-year`, `/variance` | `records.test.ts` | ✅ |
| Judgment calls, elections, due diligence, penalties | `/decisions` | `judgment.test.ts` | ✅ |
| Completeness (docs, areas, outside filings) | `/completeness`, Record 3 | `judgment.test.ts` | ✅ |

## People
| Line | Route | Test | Status |
|---|---|---|---|
| Questions → evidence | `/questions` | `people.test.ts` | ✅ |
| Blocking review notes | `/review` | `people.test.ts` | ✅ |
| Sign-offs reopen | `/review`, `/filing` | `people.test.ts` (recomputeSignOffs) | ✅ |
| Enforced roles | `/admin/access` | `people.test.ts` (can matrix) | ✅ |
| Several people at once | SoftLock, optimistic version | `change.test.ts` (409) | ✅ |
| Assignments, deadlines, notifications | `/team` | `people.test.ts` | ✅ |
| Client approval + e-file signature | `/client` | `people.test.ts` (8879) | ✅ |

## Filing and after
| Line | Route | Test | Status |
|---|---|---|---|
| Extensions | `/filing` | `filing.test.ts` | ✅ |
| Filing + e-file rejections | `/filing` | `filing.test.ts` (state machine) | ✅ |
| Client's copy | `/client` | — | ✅ |
| Freeze + amend on top | `/amendments` | `filing.test.ts` (freeze 409) | ✅ |
| Notice self-contained record | `/notices/[id]` | `filing.test.ts` | ✅ |
| Carry forward with history | `/rollforward`, Record 15 | `season-block3.test.ts` | ✅ |
| Plan next year | `/rollforward` | `season-block3.test.ts` | ✅ |
| Deterministic replay | — | `season-block3.test.ts` (replay) | ✅ |

## Firm (Feature 7)
| Line | Route | Test | Status |
|---|---|---|---|
| Firm-wide standards (versioned) | `/admin/standards` | `firm.test.ts` (standards/diff/reclassify) | ✅ |
| Sensitive data protection + view logs | `/admin/access` | `firm.test.ts` (encrypt/leak/reveal) | ✅ |
| Time vs budget | `/firm/time` | `firm.test.ts` (budget report) | ✅ |
| Status and search | `/firm`, `/search` | `firm.test.ts` (dashboard/search/oracle) | ✅ |

## Records (Feature 8) — all 17
| # | Route | Tie-out | Status |
|---|---|---|---|
| 1 Return summary vs last year | `/records/summary-vs-last-year` | engine → F1040.11/24/33 | ✅ |
| 2 Tax computation | `/records/tax-computation` | F1040.18/24, recompute | ✅ |
| 3 Area summaries | `/records/area-summaries` | readiness per area | ✅ |
| 4 Document index | `/records/document-index` | expected-but-missing | ✅ |
| 5 Depreciation by asset | `/records/depreciation` | SchE.18A/B | ✅ |
| 6 Sales detail | `/records/sales-detail` | SchD.16 → F1040.7 | ✅ |
| 7 Books to tax | `/records/books-to-tax` | SchC.31 | ✅ |
| 8 Rentals & passive losses | `/records/rentals` | SchE.26 | ✅ |
| 9 K-1 lines | `/records/k1-lines` | SchE.32 | ✅ |
| 10 Retirement | `/records/retirement` | F8606.18 → F1040.4b | ✅ |
| 11 Foreign | `/records/foreign` | F8938 year-end rate | ✅ |
| 12 Deductions & credits with limits | `/records/deductions-credits` | SchA.17 → F1040.12 | ✅ |
| 13 Payments | `/records/payments` | F1040.33 / F540NR.78 + agency | ✅ |
| 14 State split | `/records/state-split` | CA AGI | ✅ |
| 15 Carryovers | `/records/carryovers` | SchD.6 / SchD.14 | ✅ |
| 16 Basis by year | `/records/basis-by-year` | gaps flagged | ✅ |
| 17 Prior preparer vs ours | `/records/prior-vs-ours` | method-change table | ✅ |

Every record has a mode switch (engine · final · filed · amendment), numbers
linked to their recipe/evidence, a snapshot hash, and is print-ready.

## Hand-in
| Deliverable | File | Status |
|---|---|---|
| Working app from a link | Vercel (auto-import, `/api/health`) | ✅ |
| One-pager | `docs/ONE_PAGER.md` | ✅ |
| Errors found (generated) | `docs/ERRORS_FOUND.md` | ✅ |
| Video script | `docs/VIDEO_SCRIPT.md` | ✅ |
| AI usage | `docs/AI_USAGE.md` | ✅ |
| README | `README.md` | ✅ |
