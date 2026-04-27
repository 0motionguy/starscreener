// Playwright config — homepage smoke test only.
//
// Boots `npm run dev` (Turbopack on port 3023) and runs against it. First
// hit takes 30-60s while Next compiles, hence the longer webServer timeout.
//
// To run locally:
//   npx playwright install chromium   (one-time)
//   npm run test:e2e
//
// CI (Vercel preview): point baseURL at the preview URL via PW_BASE_URL.
// The webServer block is skipped automatically when PW_BASE_URL is set.

import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PW_BASE_URL ?? "http://localhost:3023";
const useExternal = Boolean(process.env.PW_BASE_URL);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: useExternal
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
