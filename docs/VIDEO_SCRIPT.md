# Video script (12–15 min)

A walk-through of the Miraflores Tax Workpaper for the Okafor-Lindqvist 2025
return. Times are approximate.

## 0:00 — The problem (1 min)
A household return built from 74 documents and 3,012 extracted values, an engine
that can be wrong, a mid-year CA→TX move, RSUs, two rentals, K-1s, a backdoor
Roth, and a foreign account. The question is never "what does the software say"
but "is the return right, and can I prove it." This tool proves it: source →
verification → change → judgment → approval → filing → after.

## 1:00 — A live trace (2 min)
- `/` overview, then `/documents`. Open a W-2 at `/doc/<id>/p/1`; click a wage
  figure and follow it to **F1040 box 1** — the recipe tree and the exact page
  field. (Record 2 shows the same number tying to `F1040.1z`.)
- Open `/schedules/8949` and the Schedule C double-count: the Paywell **1099-K**
  is already in the books, so `SchC.1` is overstated by 12,400.

## 3:00 — The error-finding mechanism (2 min)
- `/checks` and `/issues`. Checks are pure functions comparing the engine to a
  **second source** (page text, transcript, prior year), grouped into Issues.
- Show the RSU basis error (gain overstated 47,620), the mileage duplicate page,
  and two Block-4 cross-source errors: **D28/D29** the same 1,840 interest on two
  forms, and the **FX period** (2024 rate on 2025 interest).

## 5:00 — An adjustment approval with a role block (1.5 min)
- As preparer, propose the 1099-K adjustment. Try to approve it → **403**
  (nobody approves their own work). Switch to reviewer → approve. Show a
  partner-threshold item routing to the partner (|effect| > $1,000).

## 6:30 — A sign-off reopening (1.5 min)
- Fix Theo's SSN (3309 → 3390). The 8879 covers amounts (`resign_on: amounts`),
  so the **reviewer/partner** sign-offs reopen but the client's does not — show
  the content-hash scope deciding what reopens.

## 8:00 — Reject → fix → accept → freeze (2 min)
- `/filing`: the 12 required steps gate transmission. Transmit federal →
  **reject** → fix → accept → **FREEZE** (writes now 409). CA is held while
  federal is rejected. Amendments layer on top of the filed snapshot.

## 10:00 — The notice pack (1 min)
- `/notices/<id>`: a self-contained record with a manifest hash; the open notice
  is a **legal hold** that blocks retention destruction.

## 11:00 — Firm + Records (1.5 min)
- `/firm` dashboard, `/firm/time` (budget burn-down), `/admin/standards`
  (versioned), `/admin/access` (reveal a masked SSN with a reason → view log),
  `/search` (uncleared search is not an oracle).
- `/records`: 17 CPA records with a mode switch, every number linked, a tie-out
  footer, print → PDF. Show **Tax computation** (independent recompute + the
  $253 residual reported) and **Depreciation** (fed/CA/AMT + the Form 4797
  disposal).

## 12:30 — Technical decisions & trade-offs (2 min)
Event log vs CRUD; rate-based effects vs an engine rerun; content-hash sign-offs;
the simulated-renderer interface (swap in real PDFs); a Postgres + Next.js
monolith. Each: why, and what it costs.

## 14:30 — What I'd do next (0.5 min)
Chase the regular-tax recompute residual to the exact worksheet line; real client
authentication; wire `standardVersion` onto each printed record; OCR/real-PDF
renderer behind the existing interface.
