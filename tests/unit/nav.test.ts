import { describe, it, expect } from "vitest";
import { filterNav, breadcrumbFor, type BadgeCounts } from "@/lib/nav";
import type { Actor } from "@/lib/people/permissions";

const actor = (role: Actor["role"]): Actor => ({ id: role === "client" ? "cu-01" : "st-x", role, clearance: role !== "client", activeFrom: "2000-01-01" });
const labels = (role: Actor["role"], b: BadgeCounts = {}) => filterNav(actor(role), b).flatMap((g) => g.items.map((i) => i.label));

describe("role-based nav (driven by can())", () => {
  it("client sees only Overview, Questions, Approve & sign", () => {
    const l = labels("client");
    expect(new Set(l)).toEqual(new Set(["Overview", "Questions", "Approve & sign"]));
  });

  it("preparer sees working groups but no Firm admin items", () => {
    const l = labels("preparer");
    expect(l).toContain("Issues");
    expect(l).toContain("Dashboard"); // Firm dashboard is fine
    expect(l).toContain("Time");
    expect(l).not.toContain("Standards"); // standards.manage denied
    expect(l).not.toContain("Staff");
    expect(l).not.toContain("Access"); // partner/admin only
  });

  it("partner sees Access but not Standards/Staff", () => {
    const l = labels("partner");
    expect(l).toContain("Access");
    expect(l).not.toContain("Standards");
    expect(l).not.toContain("Staff");
  });

  it("firm administrator sees the Firm admin items", () => {
    const l = labels("firm_administrator");
    expect(l).toContain("Standards");
    expect(l).toContain("Staff");
    expect(l).toContain("Access");
  });

  it("no Search tab exists in the nav", () => {
    for (const role of ["preparer", "reviewer", "partner", "firm_administrator", "client"] as Actor["role"][]) {
      expect(labels(role)).not.toContain("Search");
    }
  });
});

describe("badge counts (role + masking aware)", () => {
  it("staff see work badges; client sees only its own questions badge", () => {
    const b: BadgeCounts = { issues: 12, review: 3, questions: 2, changes: 1, decisions: 4 };
    const staff = filterNav(actor("reviewer"), b).flatMap((g) => g.items);
    expect(staff.find((i) => i.label === "Issues")?.count).toBe(12);
    expect(staff.find((i) => i.label === "Review notes & sign-offs")?.count).toBe(3);

    const client = filterNav(actor("client"), b).flatMap((g) => g.items);
    expect(client.find((i) => i.label === "Questions")?.count).toBe(2);
    // The client never receives internal counts (only questions is whitelisted).
    expect(client.every((i) => i.label === "Questions" || i.count === undefined)).toBe(true);
  });
});

describe("breadcrumbs", () => {
  it("maps a nested route to Group › Page by longest prefix", () => {
    expect(breadcrumbFor("/records/tax-computation")).toEqual({ group: "Evidence", page: "Records" });
    expect(breadcrumbFor("/admin/standards")).toEqual({ group: "Firm", page: "Standards" });
    expect(breadcrumbFor("/")).toEqual({ group: "Overview", page: "Overview" });
  });
});
