# AI usage

The brief asks how AI was used and how the output was verified. Honestly:

## Tools

- **Claude Code (Opus 4.x)** as the primary pair-programmer: scaffolding the
  Next.js/Prisma project, writing the pure domain libraries (checks, effective,
  tax-effect, permissions, firm standards, records), the server actions, the UI,
  and the test suites.
- Standard local tooling (TypeScript, ESLint, Vitest, Prisma, `next build`).

## What AI did and did not do

- **Did:** translate the brief into code; enumerate the generic checks; write
  the record builders and their tie-outs; draft tests and docs; refactor to keep
  the engine DB-decoupled.
- **Did not:** invent tax numbers. Every figure on a return line comes from the
  packet (`data/packet.json`); the app never hardcodes a value the data can
  produce.

## How the output was verified

1. **Golden tests from hand-checked arithmetic.** `tests/golden/effects.expected.ts`
   holds hand-computed tax/payment effects to the cent (rate × Δ, rounded
   half-away-from-zero); `effects.test.ts` recomputes them from the v3 rates. The
   seven engine errors and their federal/CA effects are asserted there and in
   `findings.test.ts`.
2. **Second-source checks.** Every check compares the engine to printed content,
   a transcript, a prior year, or an independent recompute — so a wrong engine
   number fails a test rather than passing silently. `TAX_COMPUTATION_RECOMPUTE`
   recomputes regular tax from the bracket parameters and **reports the $253
   residual** vs the engine's Schedule D worksheet rather than hiding it.
3. **Property-style and idempotence checks.** Finding ids are stable sha256
   hashes; re-running the checks yields the same ids. The event chain verifies
   after writes.
4. **Deterministic typecheck + lint + 192 tests** gate every commit
   (`npm run check`), and `next build` compiles all routes.
5. **Human review of patterns.** Public submission patterns were reviewed; the
   arithmetic underpinning the golden tests was checked by hand, and residuals
   (e.g. the regular-tax recompute) are surfaced for a CPA, not asserted away.

The rule throughout: **AI accelerates the plumbing; the packet is the source of
truth; a hand-checked golden test or a second-source check stands behind every
number.**
