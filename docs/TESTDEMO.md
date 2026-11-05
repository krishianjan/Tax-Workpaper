# Test & Demo Guide

Exact inputs for every interactive feature. Use date **2026-06-24**, role **st-01 (preparer)** unless noted.

---

## Setup

| Setting | Value |
|---|---|
| Date (asOf) | `2026-06-24` |
| Role | `st-01 · Ngozi Okafor` (preparer) |
| URL | your Railway public URL |

Switch date/role in the header, hit **Apply**.

---

## 1. Search

Go to any page, press **⌘K** (Mac) or **Ctrl+K**.

| Type this | What you get |
|---|---|
| `D29` | Document D29 (Morgan Stanley 1099-B) |
| `mileage` | Mileage duplicate-page issue |
| `RSU` | RSU basis findings |
| `Okafor` | Household / identity results |
| `SchC.1` | Schedule C gross receipts line |
| `Northlake` | Northlake Real Estate 1099-MISC document |
| `backdoor Roth` | Roth conversion decision / finding |

Switch to role **st-04 · Marcus Bell** (no clearance) and search `SSN` — returns nothing (masked).

---

## 2. Role switcher

| Role | What changes |
|---|---|
| `st-01` | Full edit — default |
| `st-02` | Can add review notes, block sign-off |
| `st-03` | Partner — can approve |
| `st-04` | Marcus Bell — sensitive fields masked (SSNs, bank account hidden) |
| `st-05` | Admin |
| `st-06` | Sam — hired 2027, access denied |
| `cu-01` | Client Ngozi — sees Overview, Questions, Client Approval only |

---

## 3. Propose an Adjustment

Go to **Issues** → open issue **"1099-K double-count: Paywell included in both gross receipts and third-party payments"** → scroll to **Adjustments** → **Propose an adjustment**.

Fill in exactly:

| Field | Value |
|---|---|
| Primary line key | `SchC.1` |
| Kind | `tax` |
| Rate category | `schc_profit` |
| Base Δ (cents) | `-1200000` (= −$12,000 reduction to gross receipts) |
| Payment Δ fed | `0` |
| Payment Δ CA | `0` |
| Reason | `1099-K from Paywell already included in Squarespace gross receipts — removing double-count per D18 and D19` |
| Evidence ids | `D18, D19` |

Click **Propose**. Then check:
- **Changes page** — adjustment appears in the feed
- **Checks page** — "Failing (preview only)" count updates, Preview Δ tax changes
- Back on the issue — adjustment is listed under Adjustments (1)

---

## 4. Decisions

Go to **Decisions** page. You'll see **Offered (not yet decided)** templates — these are judgment calls the system identified but hasn't resolved.

### Test: Coinhaven BTC lot C6

This is already on the page. Fill in:

| Field | Value |
|---|---|
| Option | Select **B: $3,050 basis, 2021, long-term** |
| Position strength | `substantial authority` |

Click **Create & propose**.

What it does: records that the CPA chose to use Erik's stated $3,050 purchase basis (long-term) instead of the engine's $0 (short-term). Tax effect: −$1,311.65 fed / −$195.20 CA. It does NOT change the return until approved — it's a proposed decision.

After creating, the decision appears under **Recorded decisions** with status `proposed`. To see the full workflow, switch to role **st-03 (partner)** and approve it.

### What the fields mean

- **Option A vs B** — A is always the engine's current position; B is the corrected/alternative position
- **Position strength** — how defensible the choice is if audited: `substantial authority` = well-supported, `reasonable basis` = defensible but less certain, `disclosed position` = aggressive, needs Form 8275
- **Create & propose** — saves the decision and queues it for partner approval

---

## 5. Date picker — what each date shows

| Date | State |
|---|---|
| `2026-03-04` | v1 — first draft, fewer docs |
| `2026-04-14` | Extension filed with $36k payment |
| `2026-06-24` | **Best demo date** — v3, all 74 docs, all 9 errors flagged, not yet filed |
| `2026-07-10` | Client signed Form 8879 |
| `2026-07-14` | Federal e-file accepted |
| `2026-07-15` | California accepted — fully filed |
| `2026-08-21` | CA refund issued |

---

## 6. Issue categories explained

| Tag | Means |
|---|---|
| `return error` | Engine is definitively wrong — there's a correct answer |
| `judgment` | No single right answer — CPA must decide |
| `arithmetic` | Cross-line or cross-form math doesn't add up |
| `informational` | Not an error — worth noting (large deduction, unusual item) |
| `extraction error` | Document was misread or partially read |
| `compliance` | A rule or deadline isn't met |

---

## 7. Records page

Go to **Records** → pick any record (e.g. **Wages & Compensation**).

Use the mode switcher at the top:
- **engine** — what the tax software computed
- **final** — after all approved adjustments
- **filed** — the locked return as submitted
- **amendment** — any post-filing corrections

Numbers in each column are linked — click one to jump to the source document or check.

---

## 8. Sensitive data (clearance demo)

Go to **Firm → Staff** as `st-01`. You'll see SSNs and bank account numbers.

Switch to `st-04 · Marcus Bell` — same pages, all sensitive fields show `••••••` and a "no clearance" banner. The view is logged (Firm → Access shows who revealed what and when).
