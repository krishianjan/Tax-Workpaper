

<img width="1376" height="768" alt="Taxworkpaper" src="https://github.com/user-attachments/assets/c1033041-dcf9-4a6f-a26c-8d83e8741de4" />




# Miraflores Tax Workpaper

A web-native tax workpaper for the Okafor-Lindqvist household (MFJ, 2025, CA→TX move). It proves a tax return is correct — where every number came from, how it was verified, what was changed and why, who decided what, and what is still open. Not a spreadsheet. Not a tax engine. A provenance layer on top of one.

**Live demo:** deployed on Railway · **Repo:** github.com/krishianjan/Tax-Workpaper

---

## Run it locally

```bash
# 1. Start a local Postgres
docker compose up -d

# 2. Environment
cp .env.example .env
# .env needs:
#   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/workpaper
#   FIELD_ENCRYPTION_KEY=<any 64 hex chars>

# 3. Install
npm install

# 4. Create tables + import data
npx prisma db push
npm run dev        # packet auto-imports on first request (idempotent)

# 5. Open
open http://localhost:3000
```

Switch role and date in the header. Hit **Apply** after changing the date.

**Quality gate (run before every push):**
```bash
npm run check      # typecheck (strict) + lint + 201 Vitest tests
```

---

## The scenario

**Who:** Ngozi Okafor (software engineer) + Erik Lindqvist (self-employed designer), married filing jointly for tax year 2025. Two dependents: Ada (college) and Theo (8).

**Complexity:** mid-year move CA→TX (July 14), RSU vesting, 1099-K from Squarespace, Schedule C business, two K-1s (S-corp + partnership), rental income, crypto sales, SEP-IRA contribution, backdoor Roth, foreign interest income in SEK.

**9 errors found in the engine's return.** Final correction: federal −$18,830 / CA −$3,040.

**Timeline:** engagement Jan 2026 → extension filed Apr 14 → v3 computed Jun 23 → e-filed and accepted Jul 14–15 → CA refund Aug 21.

**Best demo date:** `2026-06-24` — all 74 documents in, all errors found, return not yet filed.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15.1.11 (App Router, server components + server actions) |
| Language | TypeScript 5.7 strict |
| Database | PostgreSQL via Prisma 6.3 |
| Validation | zod |
| Styling | Tailwind CSS 3.4 |
| Tests | Vitest 3 (201 tests: unit + golden) |
| E2E | Playwright (scaffolded, not in CI) |
| Deploy | Railway (app) + Railway Postgres |
| CI | GitHub Actions — `npm ci` + prisma generate + `npm run check` |

**Secrets needed:** `DATABASE_URL` (Postgres connection string), `FIELD_ENCRYPTION_KEY` (64 hex chars, used for AES-256-GCM encryption of sensitive fields).

---

## Architecture

### Three-layer data model

```
A. RAW PACKET (immutable)
   └── PacketImport: sha256-hashed, idempotent. Re-importing same bytes = no-op.
           │
           │ normalize (one-time, on first import)
           ▼
B. NORMALIZED PACKET (read-only after import)
   ├── Document / Page / ExtractedValue
   ├── ReturnVersion (v1, v2, v3) / ReturnLine / Diagnostic
   ├── Staff / ClientItem
   └── PacketBlob

           │
           │ workpaper writes (domain commands → permission check → transaction)
           ▼
C. WORKPAPER (append-only, ours)
   ├── Verification / FactCorrection
   ├── Issue / Adjustment / Decision
   ├── SignOff / ReviewNote / Question
   ├── FirmStandard (versioned) / SensitiveValue (AES-256-GCM)
   ├── Snapshot / Submission / Notice
   ├── Workspace (fork isolation, 35 tables scoped by workspaceId)
   └── Event (hash-chained, one per domain command)
```

### Event log

Every write goes through the same path:
```
domain command → can(actor, permission, context) → DB transaction + Event
```

Each `Event` contains: `seq`, `prevHash`, `hash`, `actorId`, `workspaceId`, `type`, `entityKind`, `entityId`, `payload`. The chain is tamper-evident — if any event is modified, all subsequent hashes break. Workspace isolation means forks get their own chain.

### Truth hierarchy

```
Printed content (ground truth)
  > Extracted values  (can be wrong even at high confidence)
    > Engine return versions  (can mis-apply rules)
      > Workpaper adjustments (CPA corrections, approved)
```

Corrections are always *layers* — the original is never overwritten. `effective(line, mode, asOf)` resolves which layer applies: `engine` / `final` / `preview` / `filed` / `amendment`.

### Check architecture

Each check is a pure function:
```typescript
(ctx: CheckContext) => CheckResult[]
```

It compares the engine's number to a **second source** (page text, supplemental statement, agency transcript, prior year, paystub, residency data). It never re-runs the tax engine. Finding IDs are `sha256(checkId + sortedRefs)` — re-running is idempotent.

Tax effect of a check = `Δ × v3.tax_effect_rates[rateCategory]`. Judgment items are listed but not applied until a CPA approves them.

---

## Database design

```
prisma/schema.prisma  (782 lines)

Layer A
  PacketImport          raw JSON blob, sha256 unique key

Layer B (normalized, read-only)
  Document              74 docs (D01–D74), type/issuer/receivedAt/extractionStatus
  Page                  199 pages, printed content (ground truth)
  ExtractedValue        3,012 values with position, confidence, textAsRead
  ReturnVersion         v1/v2/v3 with computedAt, taxEffectRates[], documentsUsed[]
  ReturnLine            ~1,877 lines per version (key, jurisdiction, valueJson, rule)
  Diagnostic            engine warnings per version
  LineInput             recursive recipe: which lines feed which
  LineSource            which extracted values / docs a line cites
  ClientItem            questionnaire answers, messages, call notes
  PacketBlob            large binary assets

Layer C (workpaper, append-only)
  Workspace             35-table fork isolation, hash chain per workspace
  Verification          agreed_to_source / mismatch / not_printed / needs_human
  FactCorrection        field-level corrections with before/after
  Issue                 aggregated problems (return_error/judgment/arithmetic/etc.)
  Adjustment            proposed change: primaryLineKey, kind, baseΔ, paymentΔ, evidence
  Decision              judgment call: options[], chosen, positionStrength, approvedBy
  SignOff               per-area CPA sign-off with role enforcement
  ReviewNote            blocking/non-blocking notes per area
  Question              client Q&A thread with open/answered/waived status
  TimeEntry             time logged per area (feeds budget report)
  FirmStandard          versioned firm policies
  SensitiveValue        AES-256-GCM encrypted fields with view log
  Snapshot              point-in-time return hash
  Submission            e-file record with status/ackNumber
  Notice                IRS/FTB notices with response tracking
  Event                 hash-chained audit log (one per domain command)
  PacketImport          (also Layer A anchor)
```

---

## Pipeline flow

```
Client uploads docs
      │
      ▼
data/packet.json  ──→  PacketImport (sha256, idempotent)
                              │
                              ▼
                    Normalize into Layer B
                    (Document, Page, ExtractedValue,
                     ReturnVersion, ReturnLine...)
                              │
                              ▼
              In-memory PacketModel (built once per request)
              ├── 27 checks run against model  ──→  Issues / Findings
              ├── Disposition logic  ──→  74/74 accounted
              ├── Verification  ──→  agreed / mismatch / not_printed
              └── Trace  ──→  forward (line recipe) / backward (doc citations)
                              │
                              ▼
                    CPA works in Layer C
                    ├── Propose adjustments
                    ├── Record decisions (judgment calls)
                    ├── Log review notes
                    ├── Answer / ask questions
                    └── Attest areas → Completeness gate
                              │
                              ▼
                    Completeness gate GREEN
                    ├── All variances explained
                    ├── All areas attested
                    ├── All blocking issues resolved
                    ├── Form 8867 signed
                    └── Expected docs matched
                              │
                              ▼
                    Partner approves → Filing
                    ├── Client signs 8879
                    ├── E-file submitted
                    ├── Rejection → fix → resubmit
                    ├── Acceptance → return frozen
                    └── Rollforward for next year
```

---

## Features (all 8 built)

### F1 — Evidence
Document viewer with simulated pages, evidence highlighting, "not found on page" detection. Forward trace (`/line/v3/F1040.1a` — full recipe tree). Backward trace (`/doc/D09` — every line citing this doc). 74/74 disposition accounting, time-aware. Document links: duplicates, corrections with field diffs. All writes emit hash-chained Events.

### F2 — Calculation
27 independent checks comparing engine to a second source. Finds the RSU basis ($47,620 missing), 1099-K double-count ($12,400), duplicate mileage page, Meridian M18 lot, Subaru charity valuation, fed/CA payment overstatements, state wage split, D28/D29 cross-form duplicate interest, SEK FX period error. Preview Δ = v3 + Σ failing checks.

### F3 — Change
Adjustments with what-if scenarios, bulk operations, undo, change feed, version comparison. Every adjustment feeds the preview tax delta.

### F4 — Judgment
Decisions with offered templates, option A vs B with tax effect, position strength (substantial authority / reasonable basis / disclosed position), partner approval workflow. Nothing applied to the return until approved.

### F5 — People
Client Q&A thread, blocking review notes, sign-offs that reopen on change, enforced role gates, Form 8879 signatures (taxpayer PIN 41207, spouse PIN 88310).

### F6 — Filing
Extension (Form 4868, $36k payment Apr 14), e-file with rejection/fix/acceptance, return freeze on acceptance, amendment on top, notice pack, rollforward.

### F7 — Firm
Versioned standards, AES-256-GCM sensitive data with reveal logs, time vs budget per area, firm dashboard, global search (⌘K), staff lifecycle (active_from/active_to), retention dry-run.

### F8 — Records
17 CPA records at `/records/<slug>` with mode switch (engine · final · filed · amendment), linked numbers, snapshot hash, print CSS, tie-out footers.

### Gaps (also built)
- **Workspace isolation:** 35 C-layer tables scoped by `workspaceId`. Fork copies all tables. Per-workspace hash chain. `ws-clean` and `ws-main` workspaces seeded on import.
- **Guided tour:** 5-step bottom-bar overlay, localStorage-persisted dismiss.
- **Jargon tooltips:** `<Term>` component (hover/focus/tap), 30-term glossary.
- **Landing page:** hero, 8 feature cards, live findings table, flow strip.

---

## File map

```
data/
  packet.json                 the 1.9 MB source packet (committed as delivered)

prisma/
  schema.prisma               782-line 3-layer model
  seed.ts                     imports packet.json (idempotent by sha256)

src/
  lib/
    packet/
      schema.ts               zod schema for the full packet
      model.ts                in-memory PacketModel (no DB needed for checks)
      import.ts               idempotent importer → Layer B
    checks/                   27 check files (pure functions) + runner.ts + types.ts
    evidence/
      disposition.ts          74/74 accounting logic (time-aware)
      links.ts                duplicate/supersede detection
      verify.ts               agreed_to_source / mismatch / not_printed
      highlight.ts            value-on-page detection
    change/
      effective.ts            resolves engine/final/preview at any asOf
      feed.ts                 change feed aggregation
    judgment/
      variance.ts             year-over-year variance detection
      expectedDocs.ts         expected document matching
    filing/
      gate.ts                 completeness gate (all 18 blockers)
      replay.ts               event replay for timeline
    firm/
      workspace.ts            fork, list, archive workspaces
      sensitive.ts            AES-256-GCM encrypt/decrypt + view log
      budget.ts               time vs budget
      dashboard.ts            firm-wide metrics
      search.ts               global search index
      retention.ts            dry-run retention schedule
      staffLifecycle.ts       active_from/active_to enforcement
    records/
      registry.ts             17 record definitions
      mode.ts                 engine/final/filed/amendment resolver
      tieout.ts               tie-out footer logic
    effects.ts                tax effect computation
    taxEffect.ts              rate × delta
    event.ts                  hash-chained event emitter
    session.ts                role + clearance + asOf + workspaceId
    money.ts                  integer-cents arithmetic (no floats)
    mask.ts                   server-side sensitive field masking
    nav.ts                    navigation groups + permissions
    navBadges.ts              live badge counts

  app/
    page.tsx                  landing page (/)
    overview/                 return dashboard (/overview)
    documents/                document list with disposition filter
    doc/[id]/                 document viewer + evidence highlights
    line/[version]/[key]/     forward trace (line recipe)
    checks/                   findings list + preview delta stats
    schedules/
      8949/                   capital gains reconciliation
      books-to-tax/           Schedule C books vs return
      state-split/            CA/TX allocation with residency bar
    issues/                   issue list + detail with adjustments
    changes/                  change feed + version compare
    decisions/                offered templates + recorded decisions
    variance/                 year-over-year with explain workflow
    completeness/             pre-filing gate with 18 blockers
    questions/                client Q&A thread
    review/                   review notes per area
    team/                     assignments + time logging
    client/                   client approval portal
    filing/                   extension, e-file, status, freeze
    amendments/               post-filing corrections
    rollforward/              next-year setup
    records/[slug]/           17 CPA records with mode switch
    notices/                  IRS/FTB notice tracking
    what-if/                  scenario modelling
    compare/                  version diff viewer
    search/                   global search results
    workspaces/               workspace list + fork
    firm/                     firm dashboard + time report
    admin/
      standards/              versioned firm standards
      staff/                  staff lifecycle management
      access/                 sensitive data view log
    actions.ts                shared server actions (notes, verify, sign)
    change-actions.ts         adjustment CRUD
    judgment-actions.ts       decision CRUD + variance explain + attest
    people-actions.ts         questions, review notes, sign-offs, 8879
    filing-actions.ts         extension, e-file, freeze, rollforward
    firm-actions.ts           standards, sensitive data, time, search

  components/
    Header.tsx                role switcher + date picker + ⌘K search
    NavMenu.tsx               6-group nav with dropdowns
    Finding.tsx               check result card
    GuidedTour.tsx            5-step onboarding overlay
    Term.tsx                  jargon tooltip component
    records/                  record-specific components (Sales, Depreciation...)
    ui.tsx                    shared UI primitives (Stat, chip, card...)

docs/
  HANDOFF.md                  run steps + architecture + role guide
  DATA_MODEL.md               ER diagram + layer rationale
  DECISIONS.md                D1–D43 design decisions with reasoning
  ERRORS_FOUND.md             9 engine errors + tax effect per error
  ONE_PAGER.md                architecture + trade-offs (1 page)
  BRIEF_CHECKLIST.md          demo checklist
  AI_USAGE.md                 AI tool usage log
  VIDEO_SCRIPT.md             walkthrough script

tests/
  unit/                       pure logic tests (money, checks, effects, records...)
  golden/                     full-packet assertion tests (evidence, findings, effects)
  e2e/                        Playwright specs (nav, homepage — scaffolded)
```

---

## Roles

| ID | Name | Role | Notes |
|---|---|---|---|
| st-01 | Priya Raman | Preparer | Default. Full edit access. |
| st-02 | Daniel Ortiz | Reviewer | Adds review notes, can block sign-offs. |
| st-03 | Helen Strand | Partner | Approves decisions, final sign-off. |
| st-04 | Marcus Bell | Preparer | No sensitive data clearance — SSNs/bank masked. |
| st-05 | Jo Kimura | Admin | Firm admin access. |
| st-06 | Sam Adeyemi | Quality reviewer | active_from 2027 — access denied until then. |
| cu-01 | Ngozi Okafor | Client | Sees Overview, Questions, Client Approval only. |
| cu-02 | Erik Lindqvist | Client | Same as cu-01. |

---

## Key design trade-offs

**1. Event log instead of CRUD**
Every change is a command → permission check → one transaction + one hash-chained event. The chain is tamper-evident; forks replay deterministically. Trade-off: more plumbing, projections must be recomputed. Paid back by auditability and the ability to ask "what changed since the last time I looked."

**2. Rate-based tax effects, no engine rerun**
We cannot rerun the tax engine, so a change's effect = Δ × the version's published per-dollar rates. The `what_if` block gives exact figures where available. Trade-off: estimates rather than a true recompute, but transparent, testable to the cent, and never silently re-derived.

**3. Checks compare to a second source**
A check never trusts the engine's own output — it always compares to page text, a transcript, prior year data, a paystub, etc. Finding IDs are content-addressed (sha256) so re-running is idempotent. Trade-off: `TAX_COMPUTATION_RECOMPUTE` has a $253 residual vs the full Schedule D worksheet — reported as a known finding, not hidden.

**4. Corrections are layers, originals are immutable**
FactCorrections and Adjustments sit on top of the engine's numbers. `effective()` resolves which layer applies. The original engine output is always readable. Trade-off: slightly more complex queries, but the audit trail is complete.

**5. Workspace isolation for fork/review**
Every Layer C table has a `workspaceId`. Forking copies all 35 tables. This lets a reviewer work on a copy without touching the main workpaper. Trade-off: referential complexity, but supports concurrent review workflows.

---

## Core concepts

**asOf** — the date the workpaper is being viewed at. Changes what "current version" means and which documents are "received_after_return". Set in the header.

**effective(line, mode, asOf)** — resolves what a return line is worth: engine number, preview (+ unapproved adjustments), final (+ approved adjustments), filed (locked snapshot), or amendment.

**Preview Δ** — `v3 + Σ effects of all failing checks`. Shows what the return *would* look like if everything the system flagged were approved. Not the final answer — that requires CPA decisions.

**Position strength** — how defensible a judgment call is under audit: `substantial authority` (well-supported, file without disclosure), `reasonable basis` (defensible but not airtight), `disclosed position` (aggressive — attach Form 8275).

**Completeness gate** — 18 checklist items that must all be green before the e-file button unlocks. Prevents filing with open issues, unattested areas, or missing documents.

**Hash chain** — every Event has `prevHash` and `hash`. Modifying any event in the chain breaks all subsequent hashes, making the audit log tamper-evident.

---

## Future plans

- **Real PDF rendering** — replace simulated pages with actual PDF viewer (the `DocumentRenderer` interface is already abstracted for this)
- **Multi-household** — the workspace/firm layer is in place; adding a household picker is the remaining step
- **Real tax engine integration** — currently rate-based estimates; a proper API hook would replace `what_if` with live recomputes
- **OCR pipeline** — the `ExtractedValue` model and `Verification` layer are designed to receive real OCR output; confidence scores and mismatch detection are already wired
- **E-file API** — `Submission` model and filing state machine are built; connecting to a real MeF endpoint is the remaining step
- **Client portal auth** — role switcher is a demo stand-in; production would use real client auth (Clerk or similar)
- **Audit export** — the event log is complete; a PDF/CSV export of the full workpaper trail is a projection away

