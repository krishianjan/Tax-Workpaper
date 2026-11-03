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

## Open questions (carried to Block 2)
- Coinhaven lot **C6** (F8949.H.C6): basis 0, engine used transfer-in date;
  message evidence says 2021 purchase ≈ $3,050 but the bank line is pending.
  Needs the `MISSING_OR_ZERO_BASIS` check + a client question.
- Whether any `partial_extraction` document should block a line pending the
  reconciliation check (D30/D31 page 32).
