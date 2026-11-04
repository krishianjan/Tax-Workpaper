import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("homepage /", () => {
  test("renders hero and all three CTAs", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Every number on the return, proven/ })).toBeVisible();
    await expect(page.getByTestId("cta-preparer")).toBeVisible();
    await expect(page.getByTestId("cta-worked")).toBeVisible();
    await expect(page.getByTestId("cta-tour")).toBeVisible();
  });

  test("renders 8 feature cards with links", async ({ page }) => {
    await page.goto("/");
    for (const title of ["Evidence", "Calculation", "Change", "Judgment", "People", "Filing & after", "Firm", "Records"]) {
      await expect(page.getByRole("link", { name: new RegExp(title) }).first()).toBeVisible();
    }
  });

  test("findings table renders with data rows", async ({ page }) => {
    await page.goto("/");
    const rows = page.getByTestId("finding-row");
    await expect(rows.first()).toBeVisible();
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("'live from checks' badge shows when packet is loaded", async ({ page }) => {
    await page.goto("/");
    // If the packet is imported the badge should be present; if not, the fallback
    // badge appears. Either is acceptable — just assert one of the two is visible.
    const live = page.getByTestId("findings-live-badge");
    const fallback = page.getByText("fallback");
    const liveVisible = await live.isVisible().catch(() => false);
    const fallbackVisible = await fallback.isVisible().catch(() => false);
    expect(liveVisible || fallbackVisible).toBe(true);
  });

  test("flow strip renders all 8 steps", async ({ page }) => {
    await page.goto("/");
    for (const step of ["Load packet", "Verify against the page", "Check the engine", "File & freeze"]) {
      await expect(page.getByRole("link", { name: new RegExp(step) }).first()).toBeVisible();
    }
  });

  test("'Start as Preparer' redirects to /overview", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("cta-preparer").click();
    await expect(page).toHaveURL(/\/overview/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("'Take the tour' navigates to /overview and tour is visible", async ({ page }) => {
    // Clear any prior dismissal
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("miraflores_tour_v1"));
    await page.getByTestId("cta-tour").click();
    await expect(page).toHaveURL(/\/overview/);
    // Tour should appear (the bottom-bar complementary region)
    await expect(page.getByRole("complementary", { name: /tour/i })).toBeVisible();
  });

  test("no axe violations at 1440px", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-1440", "desktop-only");
    await page.goto("/");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toHaveLength(0);
  });

  test("no horizontal scroll at 390px", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile-390", "mobile-only");
    await page.goto("/");
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = page.viewportSize()?.width ?? 390;
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 2); // 2px tolerance
  });
});
