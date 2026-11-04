# Miraflores Tax Workpaper — one page

**Core idea:** a *provenance graph* over the packet plus an *append-only,
hash-chained event log*. Every screen is a projection of that state; checks
compare the engine's return to a **second source**, never recomputing tax. The
software flags and computes; the CPA decides.

## Data model (three layers + event log)

```
 A. RAW packet (immutable, sha256, idempotent import)
        │  normalize
        ▼
 B. NORMALIZED packet (read-only)      C. WORKPAPER (ours, append-only)
    Document · Page · ExtractedValue      Verification · FactCorrection
    ReturnVersion · ReturnLine            Issue · Adjustment · Decision
    Staff · ClientUser · PacketBlob       SignOff · ReviewNote · Question
                                          FirmStandard(v) · SensitiveValue(enc)
                                          Snapshot · Submission · Notice
        │                                         │
        └──────────── every write ───────────────┘
                          ▼
     EVENT LOG  (seq, prevHash, hash)  ← one event per domain command;
                 the timeline replays through the same commands
```

**Truth hierarchy:** printed content > extracted values (can be wrong even at
high confidence) > engine return versions. Corrections are *layers*
(FactCorrection, Adjustment) — the original is never overwritten.
`effective(line, mode, asOf)` resolves engine / final / preview; records add
filed-snapshot and amendment modes. Tax effect = Δ × v3 `tax_effect_rates`
(CA-source items use `ca_source_income`), counted once at the primary line.

## Three key decisions & trade-offs

1. **Event log, not CRUD.** Every change is a command → permission check → one
   transaction + one hash-chained event. UI, API and timeline replay share the
   commands, so the season is deterministic and tamper-evident. *Trade-off:*
   more plumbing than CRUD, and projections must be recomputed — paid back by
   auditability, "since I last looked", and fork-and-replay workspaces.

2. **Rate-based effects, no engine rerun.** We cannot rerun the tax engine, so a
   change's effect = Δ × the version's published per-dollar rates; `what_if`
   gives the exact figure when one matches. *Trade-off:* effects are estimates
   (rounded half-away-from-zero at the adjustment), not a true recompute — but
   they are transparent, testable to the cent, and never silently re-derived.

3. **Checks compare to a second source; records tie out.** A check is a pure
   `(ctx) ⇒ CheckResult[]` with a stable sha256 finding id; it reads a page, a
   transcript, a prior year — never the engine's own number. Records reconcile
   their subtotals to the return lines they summarize, and a failed tie-out is
   itself a `CheckResult`. *Trade-off:* `TAX_COMPUTATION_RECOMPUTE` leaves a
   small residual vs the full Schedule D worksheet — reported honestly, which is
   the point.

**Stack:** Next.js 15 (App Router) · TypeScript strict · Prisma + Postgres ·
zod · Vitest · Tailwind · Vercel. Secrets: `DATABASE_URL`,
`FIELD_ENCRYPTION_KEY`. 27 generic checks · 17 CPA records · 192 tests.
