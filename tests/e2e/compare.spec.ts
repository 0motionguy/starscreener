// Compare smoke — guards /tools/compare?repos=a/b,c/d.
//
// Invariants:
//   1. The current tool route returns 200 and mounts its heading.
//   2. Both requested repo names appear.
//   3. The named chart region is attached.
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
      "/tools/compare?repos=vercel/next.js,facebook/react",
      { waitUntil: "domcontentloaded" },
    );
    expect(response?.ok()).toBe(true);

    // Page heading.
    await expect(page.getByRole("heading", { name: /Head-to-head/i })).toBeVisible();

    // Both repo names — they get echoed by the profile grid columns and
    // also by the embedded CompareClient chart legend, so we just look
    // for any occurrence anywhere on the page.
    await expect(page.getByText(/vercel\/next\.js/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/facebook\/react/i).first()).toBeVisible({
      timeout: 15_000,
    });

    // The chart region owns both populated and collecting-history states.
    await expect(page.getByRole("region", { name: /Compare chart/i })).toBeAttached({
      timeout: 15_000,
    });
  });
});
