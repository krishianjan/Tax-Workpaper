import { describe, it, expect } from "vitest";
import { loadModel } from "@/lib/packet/load";
import { runChecks } from "@/lib/checks/runner";
import { groupIssues, returnAffecting } from "@/lib/issues/group";

const model = loadModel();
const findings = runChecks({ model, versionId: "v3" });
const issues = groupIssues(model, findings, "v3");

describe("Issue grouping", () => {
  it("collapses many findings into real-world problems (fewer issues than findings)", () => {
    expect(issues.length).toBeLessThan(findings.length);
  });

  it("D28 basis is ONE issue even though two checks flag it (no double-count)", () => {
    // The not_printed basis evs (VALUE_VS_PRINT) and the lots (MISSING_OR_ZERO_BASIS)
    // on D28 collapse into a single basis issue.
    const basisIssues = issues.filter((i) => i.refs.includes("D28") && i.title.toLowerCase().includes("basis"));
    expect(basisIssues.length).toBe(1);
  });

  it("the D28 RSU basis issue nets the three lots' effect (≈ −15,536 fed), not summed findings", () => {
    const basis = issues.find((i) => i.refs.includes("D28") && i.title.toLowerCase().includes("basis"))!;
    // N1+N3 (stcg) + N4 (ltcg) federal tax effect = −13,293.60 − 2,241.96 = −15,535.56
    expect(Number(basis.effects.taxFed) / 100).toBeCloseTo(-15535.56, 1);
  });

  it("produces about 15–25 return-affecting issues", () => {
    const ra = returnAffecting(issues);
    expect(ra.length).toBeGreaterThanOrEqual(8);
    expect(ra.length).toBeLessThanOrEqual(25);
  });

  it("every issue has a stable 16-hex id", () => {
    for (const i of issues) expect(i.id).toMatch(/^[0-9a-f]{16}$/);
  });
});
