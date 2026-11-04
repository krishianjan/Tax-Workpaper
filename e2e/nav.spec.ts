import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Navigation refactor E2E. Run with: npm run test:e2e
// (needs browsers installed + the app running against a seeded DB).

test.describe("navigation", () => {
  test("6 menu groups render and a dropdown opens (desktop)", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-1440", "desktop-only");
    await page.goto("/");
    for (const g of ["Overview", "Evidence", "Work", "Review", "File", "Firm"]) {
      await expect(page.getByRole("button", { name: g }).or(page.getByRole("link", { name: g }))).toBeVisible();
    }
    await page.getByRole("button", { name: "Evidence" }).click();
    await expect(page.getByRole("menuitem", { name: "Records" })).toBeVisible();
    await page.getByRole("menuitem", { name: "Records" }).click();
    await expect(page).toHaveURL(/\/records/);
    await expect(page.getByText("Evidence")).toBeVisible(); // breadcrumb group
  });

  test("⌘K / Ctrl+K focuses the global search", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByRole("searchbox", { name: "Search" })).toBeFocused();
    await page.getByRole("searchbox", { name: "Search" }).fill("Sparbanken");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=Sparbanken/);
  });

  test("no Search tab in the nav", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Search", exact: true })).toHaveCount(0);
  });

  test("mobile shows a hamburger that opens an accordion", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile-390", "mobile-only");
    await page.goto("/");
    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("button", { name: /Work/ }).click();
    await expect(page.getByRole("link", { name: /Issues/ })).toBeVisible();
    await expect(page).toHaveScreenshot("overview-390.png", { fullPage: true });
  });

  test("overview has no horizontal scroll and is axe-clean", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious).toEqual([]);
    if ((await page.viewportSize())?.width === 1440) await expect(page).toHaveScreenshot("overview-1440.png", { fullPage: true });
  });
});
