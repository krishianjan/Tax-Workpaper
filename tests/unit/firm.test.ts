import { describe, it, expect } from "vitest";
import { loadModel } from "@/lib/packet/load";
import {
  seedFromPacket,
  requiredLevel,
  diffStandards,
  reclassifyImpact,
  partnerThresholdCents,
  PARTNER_THRESHOLD_DEFAULT,
  type StandardContent,
} from "@/lib/firm/standards";
import {
  encryptField,
  decryptField,
  maskToken,
  scanForLeaks,
  isLeakFree,
  isSensitiveQuery,
  canReveal,
  fieldKey,
} from "@/lib/firm/sensitive";
import { collectSensitiveFields } from "@/lib/firm/sensitiveCatalog";
import { buildBudgetReport, type TimeEntryT } from "@/lib/firm/budget";
import { buildDashboard } from "@/lib/firm/dashboard";
import { buildPacketIndex, search, scoreDoc, type SearchDoc } from "@/lib/firm/search";
import { retentionPlan, addYears } from "@/lib/firm/retention";
import { canDeactivate, isActiveAt } from "@/lib/firm/staffLifecycle";
import { maskPrintedContent } from "@/lib/mask";

const model = loadModel();

// ---- 7.1 Firm standards -----------------------------------------------------
describe("7.1 firm standards (versioned)", () => {
  const std = seedFromPacket(model);

  it("seeds thresholds from the packet + pinned constants", () => {
    expect(std.partnerThreshold).toBe(PARTNER_THRESHOLD_DEFAULT);
    expect(std.retentionYears).toBe(7);
    expect(std.confidenceThreshold).toBe(0.6);
    expect(std.variance.flagIfChangeOverPercent).toBe(10);
    expect(std.variance.andOverAmount).toBe(1000);
    expect(std.requiredSteps.length).toBe(12);
    expect(std.resignOn).toBe("amounts");
  });

  it("requiredLevel: effect over the threshold needs partner", () => {
    expect(requiredLevel(std, partnerThresholdCents(std) + 1n)).toBe("partner");
    expect(requiredLevel(std, 100000n)).toBe("reviewer"); // exactly 1,000 is not over
    expect(requiredLevel(std, -500000n)).toBe("partner"); // magnitude counts
  });

  it("diff + reclassify: raising the threshold moves an item partner→reviewer", () => {
    const raised: StandardContent = { ...std, partnerThreshold: 5000 };
    const changes = diffStandards(std, raised);
    expect(changes.find((c) => c.field === "partnerThreshold")).toBeTruthy();

    const items = [
      { id: "small", maxEffectCents: 80000n }, // $800 — reviewer under both
      { id: "mid", maxEffectCents: 200000n }, // $2,000 — partner now, reviewer after
      { id: "big", maxEffectCents: 900000n }, // $9,000 — partner under both
    ];
    const impact = reclassifyImpact(std, raised, items);
    expect(impact.map((i) => i.id)).toEqual(["mid"]);
    expect(impact[0]).toMatchObject({ from: "partner", to: "reviewer" });
  });

  it("no change => empty diff (past approvals are never re-graded silently)", () => {
    expect(diffStandards(std, { ...std })).toEqual([]);
  });
});

// ---- 7.2 Sensitive data -----------------------------------------------------
describe("7.2 sensitive data: encryption + masking", () => {
  it("AES-256-GCM round-trips", () => {
    const enc = encryptField("666-74-3390");
    expect(enc.ciphertext).not.toContain("3390");
    expect(decryptField(enc)).toBe("666-74-3390");
  });

  it("a tampered auth tag fails to decrypt", () => {
    const enc = encryptField("666-74-3390");
    const bad = { ...enc, authTag: Buffer.from("00".repeat(16), "hex").toString("base64") };
    expect(() => decryptField(bad)).toThrow();
  });

  it("a wrong key fails to decrypt", () => {
    const enc = encryptField("666-74-3390", fieldKey({ FIELD_ENCRYPTION_KEY: "a".repeat(64) } as unknown as NodeJS.ProcessEnv));
    expect(() => decryptField(enc)).toThrow();
  });

  it("mask tokens keep only the last 4 and are leak-free", () => {
    expect(maskToken("ssn", "666-74-3390")).toBe("•••-••-3390");
    expect(maskToken("account", "4483019276")).toBe("••••9276");
    expect(maskToken("ip_pin", "482915")).toBe("••••••");
    expect(isLeakFree(maskToken("ssn", "666-74-3390"))).toBe(true);
  });
});

describe("7.2 leak scanning", () => {
  it("catches full SSN, 666-SSN, account, routing and IP PIN", () => {
    expect(scanForLeaks("ssn 666-74-3390").some((h) => h.pattern === "ssn_666")).toBe(true);
    expect(scanForLeaks("acct 4483019276").some((h) => h.pattern === "account_number")).toBe(true);
    expect(scanForLeaks("routing 990000017").some((h) => h.pattern === "routing")).toBe(true);
    expect(scanForLeaks("IP PIN 482915").some((h) => h.pattern === "ip_pin")).toBe(true);
  });

  it("masked printed content is leak-free for an uncleared viewer", () => {
    // Every page that carries a full SSN must be clean once masked.
    for (const d of model.documents) {
      for (const p of d.pages) {
        const masked = maskPrintedContent(p.printed_content, false);
        expect(isLeakFree(masked), `${d.id} p${p.page}`).toBe(true);
      }
    }
  });

  it("cleared viewer sees the real value (no masking)", () => {
    const withSsn = model.documents.flatMap((d) => d.pages).find((p) => /666-\d{2}-\d{4}/.test(p.printed_content));
    expect(withSsn).toBeTruthy();
    expect(maskPrintedContent(withSsn!.printed_content, true)).toBe(withSsn!.printed_content);
  });
});

describe("7.2 reveal gate + search-is-not-an-oracle", () => {
  const base = { id: "st-01", clearance: true, activeFrom: "2025-08-01", assignedEngagementIds: ["okafor-lindqvist-2025"] };
  const req = { now: "2026-03-01T00:00:00Z", reason: "preparing 1040", engagementId: "okafor-lindqvist-2025" };

  it("allows a cleared, assigned, active actor with a reason", () => {
    expect(canReveal(base, req).allow).toBe(true);
  });
  it("denies without clearance / without a reason / before active_from / not assigned", () => {
    expect(canReveal({ ...base, clearance: false }, req).allow).toBe(false); // Marcus
    expect(canReveal(base, { ...req, reason: "" }).allow).toBe(false);
    expect(canReveal(base, { ...req, now: "2025-01-01T00:00:00Z" }).allow).toBe(false);
    expect(canReveal(base, { ...req, engagementId: "other" }).allow).toBe(false);
  });

  it("a sensitive query returns nothing for an uncleared user (no oracle)", () => {
    expect(isSensitiveQuery("666-74-33")).toBe(true);
    const index = buildPacketIndex(model);
    const uncleared = search(index, "666-74-33", { cleared: false, isStaff: true });
    expect(uncleared).toEqual([]);
    // A cleared user may search it.
    const cleared = search(index, "Okafor", { cleared: true, isStaff: true });
    expect(cleared.length).toBeGreaterThan(0);
  });
});

// ---- 7.2/7.4 search ---------------------------------------------------------
describe("7.4 global search", () => {
  const index = buildPacketIndex(model);

  it("builds an index over documents and lines with deep links", () => {
    expect(index.some((d) => d.kind === "document" && d.href.startsWith("/doc/"))).toBe(true);
    expect(index.some((d) => d.kind === "line" && d.href.startsWith("/line/v3/"))).toBe(true);
  });

  it("title matches rank above body matches", () => {
    const docA: SearchDoc = { kind: "line", id: "a", title: "Sparbanken interest", body: "x", href: "/" };
    const docB: SearchDoc = { kind: "line", id: "b", title: "x", body: "Sparbanken interest here", href: "/" };
    expect(scoreDoc(docA, "Sparbanken")).toBeGreaterThan(scoreDoc(docB, "Sparbanken"));
  });

  it("fuzzy fallback tolerates a typo", () => {
    const doc: SearchDoc = { kind: "document", id: "d", title: "Sparbanken Norrland", body: "", href: "/" };
    expect(scoreDoc(doc, "Sparbankn")).toBeGreaterThan(0);
  });

  it("results for an uncleared viewer are mask-filtered (leak-free)", () => {
    const results = search(index, "Okafor", { cleared: false, isStaff: true });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(isLeakFree(r.title), r.id).toBe(true);
      expect(isLeakFree(r.body), r.id).toBe(true);
      expect(isLeakFree(r.snippet), r.id).toBe(true);
    }
  });

  it("staff-only results are hidden from clients", () => {
    const withStaffOnly: SearchDoc[] = [...index, { kind: "issue", id: "i1", title: "internal issue", body: "secret", href: "/issues/i1", staffOnly: true }];
    const asClient = search(withStaffOnly, "internal issue", { cleared: false, isStaff: false });
    expect(asClient.find((r) => r.id === "i1")).toBeUndefined();
    const asStaff = search(withStaffOnly, "internal issue", { cleared: true, isStaff: true });
    expect(asStaff.find((r) => r.id === "i1")).toBeTruthy();
  });
});

// ---- 7.2 catalog ------------------------------------------------------------
describe("7.2 sensitive catalog", () => {
  it("collects SSNs, IP PIN, DOB and bank numbers from the packet", () => {
    const fields = collectSensitiveFields(model);
    const refs = fields.map((f) => f.ref);
    expect(refs).toContain("person:theo:ssn");
    expect(refs).toContain("person:ngozi:ip_pin");
    expect(refs).toContain("household:bank:account");
    expect(refs).toContain("household:bank:routing");
    // Theo's correct SSN is 3390 (post-fix); the catalog carries the plaintext.
    const theo = fields.find((f) => f.ref === "person:theo:ssn")!;
    expect(maskToken("ssn", theo.plaintext)).toMatch(/^•••-••-\d{4}$/);
  });
});

// ---- 7.3 time vs budget -----------------------------------------------------
describe("7.3 time vs budget", () => {
  const entries: TimeEntryT[] = [
    { staffId: "st-01", area: "wages_and_stock_compensation", minutes: 150, at: "2026-02-01T00:00:00Z" }, // 2.5h / 3.0h
    { staffId: "st-01", area: "business", minutes: 210, at: "2026-02-05T00:00:00Z" }, // 3.5h / 3.5h = 100%
    { staffId: "st-02", area: "business", minutes: 60, at: "2026-02-06T00:00:00Z" }, // pushes over 100%
    { staffId: "st-03", area: "partner_review", minutes: 90, at: "2026-02-10T00:00:00Z" },
    { staffId: "st-01", area: "california", minutes: 30, at: "2026-05-01T00:00:00Z" }, // after asOf
  ];
  const report = buildBudgetReport(model, entries, "2026-03-01T00:00:00Z");

  it("area budget/actual/remaining with alerts at 80% and 100%", () => {
    const wages = report.byArea.find((a) => a.area === "wages_and_stock_compensation")!;
    expect(wages.budgetMinutes).toBe(180);
    expect(wages.actualMinutes).toBe(150);
    expect(wages.remainingMinutes).toBe(30);
    expect(wages.alert).toBe("warn_80"); // 83%

    const biz = report.byArea.find((a) => a.area === "business")!;
    expect(biz.actualMinutes).toBe(270);
    expect(biz.alert).toBe("over_100");
    expect(biz.remainingMinutes).toBeLessThan(0);
  });

  it("only counts entries at/before asOf (burn-down to date)", () => {
    const ca = report.byArea.find((a) => a.area === "california")!;
    expect(ca.actualMinutes).toBe(0); // the May entry is after the March asOf
    expect(report.burndown.at(-1)!.cumulativeMinutes).toBe(150 + 210 + 60 + 90);
  });

  it("partner review hours are tracked separately", () => {
    expect(report.partnerReview.actualMinutes).toBe(90);
    expect(report.byArea.find((a) => a.area === "partner_review")).toBeUndefined();
  });

  it("per-staff totals", () => {
    expect(report.byStaff.find((s) => s.staffId === "st-01")!.minutes).toBe(360);
  });
});

// ---- 7.4 dashboard ----------------------------------------------------------
describe("7.4 firm dashboard", () => {
  it("overall state = least-advanced jurisdiction; blocked and over-budget flags", () => {
    const d = buildDashboard([
      {
        id: "okafor-lindqvist-2025",
        client: "Okafor-Lindqvist",
        taxYear: 2025,
        filings: [
          { jurisdiction: "federal", state: "accepted" },
          { jurisdiction: "california", state: "in_preparation" },
        ],
        nextDeadline: { what: "CA 540NR", date: "2026-04-15" },
        openBlockers: 2,
        budgetPct: 120,
        assignees: [{ role: "preparer", staffId: "st-01" }],
      },
    ]);
    expect(d.rows[0].overallState).toBe("in_preparation");
    expect(d.rows[0].blocked).toBe(true);
    expect(d.rows[0].overBudget).toBe(true);
    expect(d.totals).toMatchObject({ engagements: 1, blocked: 1, overBudget: 1 });
  });

  it("placeholder (rollforward) engagement shows not_started; empty state when none", () => {
    const d = buildDashboard([
      { id: "2026", client: "Okafor-Lindqvist", taxYear: 2026, filings: [], openBlockers: 0, budgetPct: 0, assignees: [], placeholder: true },
    ]);
    expect(d.rows[0].overallState).toBe("not_started");
    expect(buildDashboard([]).empty).toBe(true);
  });
});

// ---- 7.4 retention ----------------------------------------------------------
describe("7.4 retention (dry-run, never deletes)", () => {
  it("destroy-after = filed + 7 years", () => {
    expect(addYears("2026-04-15", 7)).toBe("2033-04-15");
  });

  it("not filed => retain, no clock", () => {
    const p = retentionPlan({ engagementId: "e", filedDate: null, retentionYears: 7, legalHold: false, now: "2040-01-01" });
    expect(p.action).toBe("retain");
    expect(p.eligibleForDestruction).toBe(false);
  });

  it("within retention => retain; past => would_destroy; always dry-run", () => {
    const within = retentionPlan({ engagementId: "e", filedDate: "2026-04-15", retentionYears: 7, legalHold: false, now: "2030-01-01" });
    expect(within.action).toBe("retain");
    const past = retentionPlan({ engagementId: "e", filedDate: "2026-04-15", retentionYears: 7, legalHold: false, now: "2034-01-01" });
    expect(past.action).toBe("would_destroy");
    expect(past.eligibleForDestruction).toBe(true);
    expect(past.dryRun).toBe(true);
  });

  it("a legal hold blocks destruction even past retention", () => {
    const held = retentionPlan({ engagementId: "e", filedDate: "2026-04-15", retentionYears: 7, legalHold: true, now: "2034-01-01" });
    expect(held.action).toBe("hold");
    expect(held.eligibleForDestruction).toBe(false);
  });
});

// ---- 7.4 staff lifecycle ----------------------------------------------------
describe("7.4 staff lifecycle", () => {
  it("deactivation is blocked until open items are reassigned", () => {
    const blocked = canDeactivate("st-01", [{ kind: "assignment", id: "a1" }]);
    expect(blocked.allow).toBe(false);
    expect(blocked.mustReassign.length).toBe(1);
    expect(canDeactivate("st-01", []).allow).toBe(true);
  });

  it("isActiveAt enforces active_from and deactivation", () => {
    // Sam (st-06) active_from 2027-01-04.
    expect(isActiveAt({ staffId: "st-06", active: true, activeFrom: "2027-01-04", deactivatedAt: null }, "2026-03-01")).toBe(false);
    expect(isActiveAt({ staffId: "st-06", active: true, activeFrom: "2027-01-04", deactivatedAt: null }, "2027-02-01")).toBe(true);
    expect(isActiveAt({ staffId: "st-01", active: true, activeFrom: "2025-08-01", deactivatedAt: "2026-05-01" }, "2026-06-01")).toBe(false);
    expect(isActiveAt({ staffId: "st-01", active: false, activeFrom: "2025-08-01", deactivatedAt: null }, "2026-06-01")).toBe(false);
  });
});
