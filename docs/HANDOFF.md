# Handoff — project state & how to resume

Concise context so a new session can continue without re-reading the codebase.

## What this is
Miraflores Tax Workpaper — a web-native tax workpaper for one household
(Okafor-Lindqvist, MFJ 2025, CA→TX move 2025-07-15). It proves a return is
correct: source → verification → change → judgment → approval → filing → after.
Software flags/computes; the CPA decides. No OCR, no tax engine, no AI in core.

**Stack:** Next.js 15 (App Router) · TypeScript strict · Prisma + Postgres · zod ·
Vitest · Tailwind · Vercel. Secrets: `DATABASE_URL`, `FIELD_ENCRYPTION_KEY`.

## Status — ALL 8 features built
- F1 Evidence, F2 Calculation (checks), F3 Change, F4 Judgment, F5 People,
  F6 Filing — built in Blocks 1–3.
- **F7 Firm** (Block 4): versioned standards, encrypted sensitive data + view
  logs + reveal, time-vs-budget, dashboard, global search, staff lifecycle,
  retention dry-run.
- **F8 Records** (Block 4): all 17 CPA records at `/records/<slug>` with a mode
  switch (engine·final·filed·amendment), linked numbers, snapshot hash, print
  CSS, and tie-out footers.
- Nav refactored to 6 groups + ⌘K search + badges + breadcrumbs + loading.
- **27 checks · 17 records · 198 Vitest tests green · `next build` clean.**

## Run it
```
npm install
# .env needs DATABASE_URL (local: docker postgres at localhost:5432/workpaper)
#            FIELD_ENCRYPTION_KEY (any 64-hex; tests fall back to a fixed key)
npm run prisma:push     # REQUIRED after any schema change (see caveat below)
npm run dev             # packet auto-imports on an empty DB (idempotent by sha)
```
Import seeds FirmStandard v1 + the encrypted SensitiveValue store. `npm run check`
= typecheck + lint + vitest. `npm run test:e2e` = Playwright (needs browsers +
running server; excluded from `check`).

## Architecture (one breath)
Three layers: A raw packet (immutable, sha256) → B normalized tables (read-only)
→ C workpaper (ours). Every write = a domain command → `can()` check → one txn +
one **hash-chained Event**. `effective(line, mode, asOf)` resolves engine/final/
preview. Checks are pure `(ctx)=>CheckResult[]` comparing the engine to a SECOND
source (never recompute tax); findings group into Issues. Tax effect = Δ × v3
`tax_effect_rates`, counted once. Records are projections with tie-outs.

## Roles & nav
Header role switcher (`/api/session` route handler): `st-01` preparer (default),
`st-02` reviewer, `st-03` partner, `st-04` Marcus (no clearance), `st-05` admin,
`st-06` Sam (active_from 2027), clients `cu-01`/`cu-02`.
Nav = 6 groups (`src/lib/nav.ts`): Overview · Evidence(Documents,Checks,Records) ·
Work(Issues,Changes,Decisions,Variance,Completeness) · Review(Review,Questions,
Team) · File(Client approval,Filing,Amendments,Rollforward) · Firm(Dashboard,Time,
Standards,Staff,Access). **All staff see every group; client sees only Overview,
Questions, Client approval.** Server still enforces who may edit. Dropdowns are
native `<details>` (work without JS).

## Search — what to type
Header box (⌘K/Ctrl+K) and `/search?q=` hit the same index: documents (id, title,
issuer, printed page text), return lines (key, label), issues, decisions, notices.
Try: a doc id `D29`, an issuer `Northlake` / `Sparbanken`, a line key `SchC.1` /
`SchB.1.6`, a topic `mileage` / `RSU` / `HVAC` / `backdoor Roth`, a name `Okafor`.
Results deep-link to the page. Uncleared viewers get masked results, and a
sensitive-looking query (e.g. a partial SSN) returns nothing (not an oracle).

## The 7 engine errors (final Δ fed −$18,830.16 / CA −$3,040.83)
RSU basis 0, 1099-K double count, mileage dup page, Meridian M18, Subaru,
fed Q4 estimate, CA 09/15 designated-2024 — plus Block-4: D28/D29 cross-form
duplicate interest 1,840 and the SEK FX-period error. See `docs/ERRORS_FOUND.md`.

## Recently fixed (this session)
1. DB schema drift — `Adjustment/Decision/SignOff.standardVersion` columns were
   missing locally → prisma errors → Next dev overlay froze clicks. Fixed with
   `prisma db push`.
2. Role switch 500 (`cookies outside request scope`) → moved to `/api/session`
   route handler (native form POST).
3. Dead dropdowns → native `<details>` menus + guarded `usePathname() ?? ""`.
4. Firm admin items (Standards/Staff/Access) were role-hidden → now reachable by
   all staff.

## Known caveats / open items
- **Always run `npm run prisma:push` after editing `prisma/schema.prisma`** — the
  local DB does not auto-migrate; stale columns throw at runtime.
- `TAX_COMPUTATION_RECOMPUTE` leaves a **$253 residual** vs the engine's full
  Schedule D Tax Worksheet — reported as a finding on purpose (docs/DECISIONS D41).
- Playwright suite is scaffolded (`e2e/nav.spec.ts`) but not executed here (no
  browsers/DB in the sandbox).
- Client authentication is out of scope (role switcher is the stand-in).

## File map (where things live)
- Checks: `src/lib/checks/*` + `runner.ts` (27 checks). Issues: `src/lib/issues/group.ts`.
- Effective/effects: `src/lib/change/effective.ts`, `src/lib/effects.ts`, `taxEffect.ts`.
- Firm (F7): `src/lib/firm/*` (standards, sensitive, budget, dashboard, search,
  retention, staffLifecycle, store), actions `src/app/firm-actions.ts`,
  pages `/firm`, `/firm/time`, `/admin/{standards,staff,access}`.
- Records (F8): `src/lib/records/*` (mode, tieout, taxComputation, registry),
  components `src/components/records/*`, routes `/records` + `/records/[slug]`.
- Nav: `src/lib/nav.ts`, `navBadges.ts`, `src/components/{Header,NavMenu,HeaderSearch,Breadcrumbs}.tsx`.
- Docs: `DATA_MODEL`, `DECISIONS` (D1–D43), `ERRORS_FOUND`, `ONE_PAGER`,
  `BRIEF_CHECKLIST`, `AI_USAGE`, `VIDEO_SCRIPT`, this `HANDOFF`.
- Tests: `tests/unit/*`, `tests/golden/*` (effects.expected.ts hand-checked).
