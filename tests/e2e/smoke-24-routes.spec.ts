// Smoke test for the canonical 24 production routes (per perf/routes.json).
//
// Each route is asserted to:
//   1. Return HTTP 200 on the initial GET.
//   2. Document <title> contains "TrendingRepo" (every page inherits this
//      from the root layout template; pages that drop it have broken meta).
//   3. The page renders a heading element (h1) within 30s — confirms the
//      server returned actual content, not a 500 hidden behind a redirect
//      or a perma-loading skeleton.
//
// This is a 24-test smoke gate, NOT a deep functional test. Per-surface
// tests (home.spec.ts, signals.spec.ts, repo-detail.spec.ts, etc.) cover
// the rich behaviour. This file's job: catch the class of regression
// where a recent change made a route 500 / 404 / hang silently.
//
// Mirrors the route list used by `npm run perf:routes` and the warmup
// workflow.

import { test, expect } from "@playwright/test";

const PROD_ROUTES = [
  "/",
  "/githubrepo",
  "/skills",
  "/mcp",
  "/reddit/trending",
  "/hackernews/trending",
  "/lobsters",
  "/devto",
  "/bluesky/trending",
  "/twitter",
  "/signals",
  "/top10",
  "/compare",
  "/funding",
  "/revenue",
  "/arxiv/trending",
  "/producthunt",
  "/huggingface",
  "/npm",
  "/breakouts",
  "/categories",
  "/methodology",
  "/research",
  "/tools/revenue-estimate",
] as const;

test.describe("smoke: 24 prod routes return 200 + render content", () => {
  for (const route of PROD_ROUTES) {
    test(`GET ${route}`, async ({ page }) => {
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response, `no response for ${route}`).not.toBeNull();
      expect(response!.status(), `wrong status for ${route}`).toBe(200);

      const title = await page.title();
      expect(title.toLowerCase(), `title missing TrendingRepo on ${route}`).toContain("trendingrepo");

      // At least one heading should render — catches the "endless skeleton"
      // failure mode where SSR returns 200 but the page content never
      // resolves (Promise.all rejection → React error boundary → blank).
      // Use locator.first() to avoid strict-mode multi-match assertion.
      await expect(
        page.locator("h1, h2").first(),
        `no h1/h2 rendered on ${route}`,
      ).toBeVisible({ timeout: 30_000 });
    });
  }
});
