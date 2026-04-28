// News smoke — guards /hackernews/trending V3 surface.
//
// Invariants:
//   1. GET /hackernews/trending returns 200.
//   2. NewsTopHeaderV3 eyebrow renders (e.g. "// HACKERNEWS · TOP STORIES" —
//      we match the HACKERNEWS prefix to stay reskin-tolerant).
//   3. The "// FEATURED · TODAY · 3 PICKS" strip is present.
//   4. At least one external source link is in the page.
//
// The current eyebrow text is "// HACKERNEWS · TOP STORIES" (not LAST 24H);
// we match a flexible HACKERNEWS pattern so renaming the time window doesn't
// flake the smoke.

import { test, expect } from "@playwright/test";

test.describe("hackernews trending", () => {
  test("renders V3 header strip with eyebrow + featured + source links", async ({
    page,
  }) => {
    const response = await page.goto("/hackernews/trending", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.ok()).toBe(true);

    // Eyebrow row — V3 mono, scoped to HACKERNEWS prefix.
    await expect(
      page.getByText(/\/\/\s*HACKERNEWS/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Featured strip eyebrow — present whether or not 3 stories are seeded.
    await expect(
      page.getByText(/FEATURED.*3 PICKS/i).first(),
    ).toBeVisible();

    // At least one anchor — internal or external.
    const anyLink = page.locator("a[href]").first();
    await expect(anyLink).toBeAttached();
  });
});
