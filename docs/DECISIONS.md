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

## Open questions (carried to Block 2)
- Coinhaven lot **C6** (F8949.H.C6): basis 0, engine used transfer-in date;
  message evidence says 2021 purchase ≈ $3,050 but the bank line is pending.
  Needs the `MISSING_OR_ZERO_BASIS` check + a client question.
- Whether any `partial_extraction` document should block a line pending the
  reconciliation check (D30/D31 page 32).
