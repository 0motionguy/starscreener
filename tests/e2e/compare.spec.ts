// Compare smoke — guards /compare?repos=a/b,c/d.
//
// Invariants:
//   1. GET /compare?repos=vercel/next.js,facebook/react returns 200.
//   2. Page heading "Compare Repos · Canonical Signals" mounts.
//   3. Both repo full names eventually appear on the page (rendered from
//      the client store using the URL-param hand-off, regardless of
//      whether /api/compare returns a profile body or errors).
//   4. The chart region renders either a chart canvas/svg OR the
//      "// COLLECTING HISTORY" mono fallback when daily snapshots are
//      sparse — both are valid steady states.
//
// The page is heavily client-rendered: the profile grid hydrates from
// the Zustand compare store off `?repos=...` and the chart pulls from
// `/api/compare/github`. We intentionally only assert visible-ness, not
// numeric content, so we don't flake on data churn.

import { test, expect } from "@playwright/test";

test.describe("compare", () => {
  test("renders heading, both repo names, and chart-or-fallback", async ({
    page,
  }) => {
    const response = await page.goto(
      "/compare?repos=vercel/next.js,facebook/react",
      { waitUntil: "domcontentloaded" },
    );
    expect(response?.ok()).toBe(true);

    // Page heading.
    await expect(
      page.getByRole("heading", { name: /Compare Repos.*Canonical Signals/i }),
    ).toBeVisible();

    // Both repo names — they get echoed by the profile grid columns and
    // also by the embedded CompareClient chart legend, so we just look
    // for any occurrence anywhere on the page.
    await expect(page.getByText(/vercel\/next\.js/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/facebook\/react/i).first()).toBeVisible({
      timeout: 15_000,
    });

    // Chart region — either an SVG/canvas chart mounts, or the
    // "// COLLECTING HISTORY" mono fallback shows. We accept either.
    const chartOrFallback = page
      .locator("svg, canvas")
      .or(page.getByText(/\/\/\s*COLLECTING HISTORY/i))
      .first();
    await expect(chartOrFallback).toBeAttached({ timeout: 15_000 });
  });
});
