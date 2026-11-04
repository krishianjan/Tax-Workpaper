# Decisions

Where the data was ambiguous, we wrote it down and chose the conservative
option. Block 1 (Foundation + Evidence) decisions:

## D1 — Ground truth is `pages[].printed_content`, not `text_as_read`
The readme truth hierarchy puts printed content first. The pipeline's
`text_as_read` can itself be wrong. **D62 proves it**: the extracted value and
`text_as_read` both say EIN `74-3829516`, but the page prints `74-3829156`
(a transposition) at confidence 0.97. Verification therefore searches the
printed content for the value; a value that cannot be found there is a
`mismatch_with_source` finding, regardless of confidence.

## D2 — Confidence is never a status
A value with confidence < 0.6 is routed to `needs_human` even when it matches
the page (D64 handwritten `$?,500` at 0.41). Confidence rides alongside the
status as a separate chip.

## D3 — Missing ≠ zero
A blank `text_as_read`, `(not reported)`, or `unknown` for a money field is
stored as `not_printed`, never silently 0 (e.g. D28 basis). Generalizing this to
a first-class `missing` state and `blocked_by_missing` lines is a Block 2 item
(patch v1.1 §1); the verification layer already refuses to read these as 0.

## D4 — Current version = latest version computed at or before the as-of clock
Default as-of is `2026-06-24` (after v3 @ 2026-06-23). Dispositions and
"documents received after the return" are computed against this clock, so D71
(SS card, 2026-07-13) and D72 (exam letter, 2028) are `received_after_return`,
not errors.

## D5 — Dispositions are generic, not hardcoded
Status is derived: received-after-asOf → used-in-current-version → superseded →
duplicate → structured-elsewhere → partial → unaccounted. On this packet that
yields 71 `used`, D30 `superseded` (D31 CORRECTED), D71/D72
`received_after_return`, and 0 `unaccounted`. D07/D69/D70 are `used` with a note
that their content is structured in prior-years / agency records (they appear in
v3 `documents_used`).

## D6 — Links are evidence, never deletions
Duplicates (D10 → D09) and corrections (D31 → D30) are linked and explained, and
both documents are kept. Issuer identity is the EIN when any extracted value
carries one, else the issuer name.

## D7 — `doc:<id>#page<n>` and version refs resolve
`doc:Dxx#pageN` points at a real document whose page the pipeline did not
extract — it resolves to the document (and page) and is not an error. Timeline
entries also reference return versions directly (`v1`/`v2`/`v3`); these are a
first-class `version` ref kind. Result: **0 unresolved references** on this
packet.

## D8 — Architecture: pure model + DB persistence
All logic is pure over an in-memory `PacketModel`, so the golden tests need no
database. The database stores the immutable raw import, the normalized packet,
and the append-only workpaper/event layer. Server components read the model for
display and write Layer C through server actions that emit events.

## D9 — SUM_RECOMPUTE is arithmetic integrity, reported-all and triaged
The spec asks us to recompute every line with inputs and "report all; triage
here". A naive re-add flags 93 lines — most are legitimate subtotals that
subtract (net profit = income − expenses; AGI nets adjustments). These are
reported at **info** level in the "Arithmetic integrity" category, separate from
the engine-vs-second-source checks (patch v1.1 §2). They are not return errors;
they confirm the engine's own addition is internally consistent given its sign
conventions. A reviewer scanning them looks for a subtotal that neither adds nor
subtracts cleanly.

## D10 — Checks compare to a second source; they never recompute tax
Each check declares a `secondSource` (page text, supplemental statement, agency
transcript, prior year, deposit detail, paystub, residency, client answer,
identity document). Tax effect is always Δ × the base version's rate, never a
re-run of the engine.

## D11 — Preview excludes judgment items
"Workpaper preview = v3 + Σ effects of failing checks (not yet approved)" sums
only `status=fail` findings that are not `judgment`. The state-source wage split
is a judgment call (payroll reporting vs work location vs residency are three
different facts), so it is listed with a suggested amount but not added.
Measured preview Δ tax: federal −$19,857.01, California +$270.23 across 55
failing checks — the RSU basis fix (−15,536 fed), the 1099-K double-count
(−4,402), the mileage duplicate (−919) and the federal estimate correction
(+1,000).

## D12 — Payment effects are 1:1 on balance due
Payments and credits change tax/balance 1:1 (readme). An overstated payment
line means the balance due was understated; correcting it increases tax owed by
the same amount. These use a `payment` category, not a rate.

## Block 2 — Change (Features 3, + Step-0 fixes)

### D13 — Tax, payment and balance are three separate effects
A change carries `taxFed/taxCa` (liability) and `payFed/payCa` (payments), never
conflated. `balance = tax − payments`. The Block-1 preview mixed them and had the
wrong sign; fixed. Payment fixes (federal −$1,000, CA −$3,500) change the balance
only. Verified end-to-end: final = v3 ± the hand-checked table — federal tax
−$18,232.99, CA tax −$2,922.43, federal balance −$17,232.99, CA balance +$577.57.

### D14 — Tax effect is computed from the change to the taxable BASE, not the line
Reducing an expense increases profit, so the mileage fix (expense −$2,590) has a
**+$919.45** federal effect, not −$919.45 (the Block-1 sign bug). Each
`Adjustment` stores an explicit signed `baseDeltaCents`; the line's `newValue` is
display mechanics. One adjustment can touch several lines (SchC.9/44a/44c) but
carries exactly one effect.

### D15 — Issues group findings; effects never sum raw findings
An `Issue` = problem class + anchor document (or line). D28 basis is flagged by
both `VALUE_VS_PRINT` (basis read as 0) and `MISSING_OR_ZERO_BASIS`; they collapse
into one issue. Within an issue, effects are deduped per line (largest-magnitude
finding) then summed across distinct lines — so the RSU issue nets −$15,535.56
federal (N1+N3+N4), counted once. 15 return-affecting issues on this packet.

### D16 — Partner threshold = firm `variance_review.and_over_amount` ($1,000), "> " strict
Interpretation: the firm rule "tax effect over 1,000 requires partner sign-off"
uses the only numeric standard in the packet. Strictly greater-than, so the
federal payment (|balance| exactly $1,000) needs only a reviewer; the CA payment
($3,500) needs a partner. The threshold is checked on federal **or** CA.

### D17 — Payment-only adjustments need a reviewer; partner if |balance| > threshold
Firm-standard interpretation (recorded): a payment-only change has no tax effect
but moves the balance, so it still requires an independent approver, and a partner
when the balance magnitude exceeds the threshold.

### D18 — Rounding: half away from zero, per adjustment, then sum
Each effect is rounded to the cent half-away-from-zero at the adjustment; callers
sum the rounded values. This matches the hand-checked table exactly.

### D19 — Modes: engine / final / preview
`final` = engine + approved; `preview` = final + reviewed + proposed. Rebase of an
older-base adjustment on a new version: equal to the adjustment's value →
`absorbed`; equal to the old base → `rebased`; otherwise → `stale` (excluded,
three values shown). The feed uses event **seq**, never timestamps.

## Block 2 — Judgment (Feature 4)

### D20 — Software flags; the CPA decides
Checks and swings produce findings and offered decision *templates* (options,
effects, evidence, authority) but never a decision. A `Decision` is invalid
without authority, ≥1 evidence and (for real choices) ≥2 options. Nothing reaches
the final until a decision is approved; judgment items stay out of the preview.

### D21 — Decision dependency hash → reopen, with cascade
`dependencyHash = hash(sorted evidence ids + their content hashes + current
watched-line values)`. An approved decision whose hash changes flips to
`reopened` (event + "what changed") and its adjustments (same issue) go **stale**
— never silently reverted. Verified over the DB: approve C6 option B on the
message → attach the bank statement → decision reopened, adjustment stale.

### D22 — Evidence gate past "proposed"
A decision whose required document is still missing (C6's bank line) cannot
advance past `proposed` unless the CPA explicitly accepts weaker evidence
(recorded) or the evidence is supplied.

### D23 — Adjustments link to decisions via `issueId`
No decision→adjustment FK exists, so "adjustments created from a decision" means
they share the decision's `issueId`; the reopen cascade uses that link.

### D24 — Due diligence: blocked-by-issue, reviewer signs
Form 8867 for a credit is `blocked` while a linked issue is open (Theo's CTC is
blocked by the open SSN-identity issue). The preparer completes; a reviewer who
is not the preparer signs.

### D25 — Completeness readiness is computed; attestation is human
An area is green only when its open issues, pending decisions and undisposed
documents are all zero. The preparer attests a green area; a non-green area needs
an override reason a reviewer signs. The gate is green only when every expected
document is matched/explained, every area is green and attested, Form 8867 is
complete, no blocking issue is open, and outside filings are resolved.

### D26 — Expected documents and outside filings are derived, not hardcoded
`ExpectedDocument`s come from pass-through basis history (K-1s), the prior
preparer's open items, and questionnaire answers implying a document, matched to
a 2025 document. The outside-filings register is derived from related returns and
engine diagnostics (FBAR, 8938, 3520, 1099-NEC, Woodworks 1120-S, Ridgeline 1065,
Ada's 1040, Texas n/a).

## Block 3 — Filing and after (Feature 6)

### D34 — Gate = required steps computed from data, plus guards
The filing gate recomputes the 12 `required_steps` from data (not checkboxes),
and adds: no open blocking notes/questions, no reopened sign-offs, completeness
green, no stale adjustments, no unapproved judgment issues, and both spouses
signed. A failed gate lists the exact blockers. "Diagnostics resolved" and "due
diligence completed" are shown honestly (red until the work is done).

### D35 — A rejected submission is immutable; retransmit is a new submission
Rejections are kept forever (keyed by the agency submission id). CA is held while
federal is rejected (`STATE-HOLD`) and may transmit only after federal
acceptance. The 8879/signed snapshot hash must equal the transmitted snapshot
hash.

### D36 — Reject code → correction via a table
`R0000-504-02` maps (no string matching) to the Theo identity correction + a
client question, and records honestly that the mismatch was caught before filing
(Block 1). D71 + msg-10 drive a FactCorrection 666-74-3309 → 666-74-3390.

### D37 — Freeze per jurisdiction; amend on top
Acceptance writes a `Snapshot(kind=filed)` and freezes that jurisdiction
(federal 07-14, CA 07-15). Writes to frozen content 409. An amendment is a new
case referencing the filed snapshot as an immutable base. `Reset season` clears
the replayed filing artifacts so the workpaper is editable again in a demo.

### D38 — We compute interest/FTP ourselves; the tl-25 ReplayConflict
Post-filing interest (7%/yr daily from 2026-04-15) and FTP (0.5%/month or part
month) are computed from `post_filing_rates`. The final is an overpayment, so
both are 0 — and the scripted "federal balance paid" (tl-25) is recorded as a
`ReplayConflict` (refund expected), never invented as a payment. CA's refund
(tl-26) is consistent. Replay is deterministic and idempotent (stable ids; the
replay hash is order-independent of equal-time events).

### D39 — Notice items map to lines via a configurable table
`L566_ITEM_MAP` maps each examination item to its lines/documents/adjustments
(no string matching). The response pack is built from the frozen snapshot with a
manifest of every file's sha256 + the snapshot hash, so it verifies without the
app. Retention = filed + 7 years; an open notice is a legal hold that blocks
destruction.

### D40 — Rollforward carries v3 carryovers (+ approved finals) with provenance
Carryovers come from v3 `carryovers_out` tagged with the approved adjustment ids
that bear on them (MTC 3,871; Ridgeline capital 63,660; SEP 2,786; CA depreciation
basis diffs). 2026 expected documents exclude ended sources (stock-plan issuers =
former employer Corvane; payoff-statement issuers = Lonestar; seller-closing
issuers = Barton Hills). 2026 estimates: federal 110% of 2025 final total tax in
4 equal installments; CA 30/40/30 on CA-source income only.

### D41 — Firm time zone America/Chicago
The firm's Austin address implies America/Chicago; deadlines are stored UTC and
displayed in that zone (recorded assumption, shared with D30).

## Block 3 — People (Feature 5)

### D27 — One permission function, deny by default
`can(actor, action, resource, ctx)` is the single source the UI, API and replay
all call. Gates: `active_from` (Sam before 2027-01-04, Marcus before 2026-03-24),
role, client isolation (own engagement only, never internal/staff-only), admin
cannot approve/sign tax content, frozen blocks writes (quality may still add a
post-filing note), item-level independence (no self-review/approve/sign), and
clearance for unmasking. Anything not explicitly allowed is denied.

### D28 — `resign_on` = `amounts` (firm standard)
The packet shows no re-signature between the Theo SSN correction (tl-22) and
re-acceptance (tl-23), so the default re-sign policy is `amounts`: the client
8879 covers the amount lines only. Correcting Theo's SSN (identity) reopens the
reviewer/partner **return** sign-offs but **not** the client 8879. Order
invalidation cascades within the return-approval chain only; the 8879 is governed
solely by its own amounts hash. Set `firm.starter_standards.resign_on =
amounts_and_identity` to require re-signature on identity changes.

### D29 — Sign-off scope decides what reopens
`coveredHash` is computed over the FINAL effective amounts, the identity hash
(dependent SSNs + FactCorrections), and in-scope decision hashes. After any
command the hashes are recomputed; a mismatch flips the sign-off to `reopened`
with a diff, and a reopened lower level invalidates higher levels (return chain
only).

### D30 — Deadlines in UTC, displayed America/Chicago
Deadlines are stored UTC and displayed in the firm's local zone (Austin → Chicago,
recorded assumption). Status is computed (overdue / due soon ≤ 7 days / upcoming /
met); the missed internal hand-off (2026-03-27) and review (2026-04-08) dates are
shown as overdue honestly.

### D31 — Notifications deduped per (user, entity, type) within 10 minutes
Prevents a notification storm; the email adapter is a no-op stub (no keys).

### D32 — Answers become evidence, acceptance ≠ resolution
A question's answer is stored as an Attachment and auto-linked as evidence to its
target; accepting it is a staff action that does not by itself resolve the Issue.
A blocking question keeps the filing gate red until accepted or withdrawn.

### D33 — Client actor authentication is out of scope
The role switcher is staff-only; client commands build a client actor from the
signer id (cu-01/cu-02). Real client authentication is a separate concern noted
for later; `can()` still enforces client isolation on every client command.

## Block 4 — Step 0 + Feature 7 (Firm)

### D34 — Cross-form duplicate detection keys on the shared account, not the issuer
`CROSS_FORM_DUPLICATE_INCOME` groups income lines by (type, amount, recipient,
account token parsed from the page, e.g. "account ending 7731") and fires only
when two DIFFERENT documents with DIFFERENT issuer names report the same amount.
That is exactly the D28/D29 sweep case Block 1's `DUPLICATE_DOCUMENT` (issuer +
form + EIN) cannot see. The effect removes one copy (−1,840 interest).

### D35 — FX period rule: income at the year average, balances at year-end
`FX_RATE_PERIOD` treats SchB/SchC foreign lines as flows (correct rate =
`<taxYear>_average`) and F8938 / FBAR / `.max`/`.ye` lines as snapshots (correct
rate = `<taxYear>_year_end`). So SchB.1.6 (2024 average) is wrong (→ 2025 average,
Δ +124) while F8938 (2025 year-end) passes. Recomputation rounds to whole dollars
to match the engine's line precision.

### D36 — SEP nondeductible and basis gaps are raised, never adjudicated
`NONDEDUCTIBLE_CONTRIBUTION` and `BASIS_GAP` have NO return tax effect
(`judgment: true`); they open a compliance / scope Issue marked "CPA to
determine". The app flags; the CPA decides (and, for the SEP, an OutsideFiling
row is opened to evaluate Form 5330 / corrective action).

### D37 — Firm-standard thresholds are pinned constants on top of the packet
`firm.starter_standards` states the partner threshold ($1,000), retention
(7 years) and confidence floor (0.60) only in prose. Version 1 of `FirmStandard`
normalizes them into structured fields (`PARTNER_THRESHOLD_DEFAULT`, etc.). An
admin edit creates a new version; `reclassifyImpact` shows which graded items
WOULD change level — a past approval is never silently re-graded, and frozen
engagements keep their version.

### D38 — Sensitive values live in an encrypted side table, revealed one response at a time
Sensitive fields are catalogued from the packet (`person:<id>:ssn`,
`household:bank:account`, …), encrypted with AES-256-GCM (`FIELD_ENCRYPTION_KEY`;
a fixed test key when unset), and stored in `SensitiveValue`; everywhere else
shows the mask token. `revealSensitive` gates on clearance + assignment + a
reason, writes a `ViewLog`, and returns the plaintext for that one response
(never cached). The leak scanner runs over masked output; `maskPrintedContent`
already breaks SSN/EIN/long-digit runs, so uncleared renders are leak-free.

### D39 — Search is permission/mask-filtered before ranking and is not an oracle
Global search masks every returned field (title, body, snippet) for uncleared
viewers and hides `staffOnly` rows from clients. A sensitive-looking query from
an uncleared user returns `[]` regardless of whether a value exists, so search
cannot be used to confirm a match. Postgres FTS + `pg_trgm` is the DB plan; the
pure core mirrors the ranking (token overlap + trigram Jaccard fallback).

### D40 — Retention is a recorded dry-run; this app never deletes
`retentionPlan` computes destroy-after = filed + retentionYears and reports
`would_destroy` only when past retention with no legal hold. Any open notice is a
legal hold that forces `hold`. The job is always `dryRun: true` — it lists what
it would destroy and records the decision; nothing is ever deleted here.

## Feature 8 — Records

### D41 — Regular-tax recompute reports a residual, it does not assert the engine is wrong
`TAX_COMPUTATION_RECOMPUTE` independently recomputes regular tax from
`brackets_mfj` + the 0/15/20 LTCG thresholds, with unrecaptured §1250 at
min(25%, the marginal ordinary rate) and 28%-rate gain. On this return it gets
59,980 vs the engine's Schedule D Tax Worksheet 59,727 — a $253 residual, which
the check REPORTS (status warn, no tax effect, "reconcile the worksheet"). The
full IRS worksheet has ~45 lines with per-line rounding; reproducing it to the
cent is out of scope. A reported residual is the honest second-source result and
is exactly the kind of thing a CPA should eyeball before filing.

### D42 — Record modes: engine/final are computed; filed/amendment resolve to approved
A record's mode maps to the change-engine Mode via `toChangeMode` (engine→engine,
everything else→final). `filed` and `amendment` share the approved set here; the
page swaps in a filed `Snapshot` or amendment layer when one exists in the DB.
Every record carries a snapshot hash (a content hash of its mode's totals) so a
printed record is verifiable.

### D43 — Tie-outs are internal cross-line reconciliations surfaced as checks
Each record reconciles its subtotals to the return lines it summarizes; a failed
tie-out is a `TIE_OUT` CheckResult, not just a red cell. The generic `TIE_OUT`
check reconciles interest (ΣSchB.1.* → F1040.2b), capital gain (SchD.16 →
F1040.7) and wages (F1040.1a → F1040.1z); per-record tie-outs (depreciation →
SchE.18A/B, K-1 → SchE.32, itemized → F1040.12, etc.) live in each record and
render in its footer.

## Open questions (carried forward)
- Coinhaven lot **C6** (F8949.H.C6): basis 0, engine used transfer-in date;
  message evidence says 2021 purchase ≈ $3,050 but the bank line is pending.
  Needs the `MISSING_OR_ZERO_BASIS` check + a client question.
- Whether any `partial_extraction` document should block a line pending the
  reconciliation check (D30/D31 page 32).
- The $253 regular-tax residual (D41) should be chased to the exact Schedule D
  Tax Worksheet line before filing.
