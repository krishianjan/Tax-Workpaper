# Miraflores Tax Workpaper

A web-native tax workpaper for the Okafor-Lindqvist household (MFJ, 2025). It
starts where extraction stops — one JSON packet — and proves the return is
right: where every number came from, how it was verified, where each document
landed, and what is still open. **Not a spreadsheet.**

This repository is **Block 1**: Foundation + Evidence (Feature 1) + the schema
and event log the later blocks slot into. Calculation checks (Feature 2),
Change, Judgment, People, Filing and Firm follow.

## What works now

- **Import & integrity** — zod-validated, idempotent import of the 1.9 MB packet
  into Postgres in one transaction (74 docs, 199 pages, 3,012 values, 3 versions,
  1,877 lines). Re-importing the same bytes is a no-op; different bytes make a
  new import and keep the old one. **0 unresolved references.**
- **Evidence**
  - Document viewer: simulated, form-shaped pages labelled "Simulated", with a
    replaceable `DocumentRenderer` interface (a `PdfRenderer` stub shares it) and
    stable deep-link URLs (`/doc/D09/p/1?ev=ev-0035#ev-0035`).
  - Highlighting with a red **"not found on page"** finding when a value isn't in
    the printed text.
  - Forward trace: `/line/v3/F1040.1a` — the recipe tree (inputs recurse, sources
    resolve to evidence with verification badges, rule text, cycle/depth guards).
  - Backward trace: `/doc/D09` — every line in every version that cites the doc
    or its values, plus its disposition.
  - **Verification against printed content** (ground truth, not confidence):
    `agreed_to_source` / `mismatch_with_source` / `not_printed` / `needs_human`.
    D62's 0.97 EIN mismatch and D64's 0.41 handwritten read are both caught.
  - **74/74 accounted**: every document has a non-`unaccounted` disposition,
    time-aware against the as-of clock.
  - Linking: duplicates (D10 → D09) and corrections (D31 → D30, with a
    field-by-field diff), kept as evidence.
  - Attach notes as evidence (every write emits a hash-chained `Event`).
- **Masking** enforced server-side for non-cleared staff (st-04).
- **Security headers** (CSP, `frame-ancestors none`, `nosniff`).

## Run it locally

```bash
docker compose up -d          # local Postgres
cp .env.example .env          # DATABASE_URL points at it
npm install
npx prisma db push            # create tables
npm run seed                  # import data/packet.json (idempotent)
npm run dev                   # http://localhost:3000
```

Switch roles and the as-of date in the header. Try `/doc/D62/p/1?ev=ev-1045`
(EIN mismatch), `/line/v3/F1040.1a` (recipe), `/doc/D31` (correction diff).

## Quality gate

```bash
npm run check   # typecheck (strict) + lint + vitest (unit + golden)
```

Golden tests (`tests/golden/evidence.test.ts`) run the real packet and assert
the Feature 1 "must find" rows: D62 mismatch, D64 low-confidence, D10/D09
duplicate, D31/D30 supersede + diff, 74/74 accounted, the F1040.1a recipe
(212,400 = 104,600 + 107,800, D10 counted once), and 0 unresolved references.

## Deploy (Vercel + Neon)

Set `DATABASE_URL` to a Neon connection string, `npx prisma db push`, then
`npm run seed` once. The only secret is `DATABASE_URL`.

## Layout

```
data/packet.json            the packet, committed as delivered
prisma/schema.prisma        3-layer model (raw · normalized · workpaper)
src/lib/packet/             zod schema, in-memory model, idempotent importer
src/lib/refs/resolve.ts     reference parser + resolver (every ref kind)
src/lib/evidence/           verify · disposition · links · trace · highlight
src/lib/money.ts            integer-cents money, no floats
src/app/                    overview, documents, doc viewer, line recipe
tests/                      unit + golden
docs/                       DATA_MODEL · DECISIONS · ERRORS_FOUND
```
