import { defineConfig, devices } from "@playwright/test";

// E2E config. Requires: `npm i -D @playwright/test @axe-core/playwright`,
// `npx playwright install`, a reachable Postgres (DATABASE_URL) and the app
// running (the webServer block boots it). Not part of `npm run check`.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop-1440", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile-390", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run build && npm run start",
        url: "http://localhost:3000",
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
});
