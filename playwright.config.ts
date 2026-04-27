// Playwright config — STARSCREENER smoke harness.
//
// Targets a configurable baseURL via STARSCREENER_BASE_URL; falls back to the
// dev server on port 3023 (per `npm run dev`). When STARSCREENER_BASE_URL is
// set, we assume the server is already running (CI / preview) and skip the
// webServer block.
//
// Legacy alias: PW_BASE_URL is still honored so existing configs / scripts
// keep working.
//
// To run locally:
//   npx playwright install --with-deps chromium   (one-time)
//   npm run dev                                    (in another shell)
//   npm run test:e2e
//
// Smoke specs are intentionally chromium-only — cross-browser is a separate
// regression effort, not the smoke contract.

import { defineConfig, devices } from "@playwright/test";

const baseURL =
  process.env.STARSCREENER_BASE_URL ??
  process.env.PW_BASE_URL ??
  "http://localhost:3023";
const useExternal = Boolean(
  process.env.STARSCREENER_BASE_URL ?? process.env.PW_BASE_URL,
);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  // 30s test timeout (was 15s) to absorb Next 15 dev-mode cold-compile of
  // /, /repo, etc. The first hit on each route in dev triggers a Turbopack
  // chunk compile that can run 8-12s on Windows + OneDrive. After warmup
  // every page renders well under 1s, but the first navigation per route
  // ate the 15s budget. Production builds (npm run build && npm start) do
  // not need this — flip to 15s in CI when running against next start.
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
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
