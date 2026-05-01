// News smoke — guards /hackernews/trending V4 surface (SourceFeedTemplate).
//
// Invariants:
//   1. GET /hackernews/trending returns 200.
//   2. V4 crumb renders (e.g. "HN · TERMINAL · /HACKERNEWS") — we match the
//      /HACKERNEWS suffix to stay reskin-tolerant.
//   3. At least one anchor is in the page (internal or external).

import { test, expect } from "@playwright/test";

test.describe("hackernews trending", () => {
  test("renders V4 source-feed crumb + source links", async ({ page }) => {
    const response = await page.goto("/hackernews/trending", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.ok()).toBe(true);

    // V4 crumb — match the /HACKERNEWS path token (works for both V3
    // "// HACKERNEWS …" and V4 "HN · TERMINAL · /HACKERNEWS").
    await expect(
      page.getByText(/\/HACKERNEWS/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // At least one anchor — internal or external.
    const anyLink = page.locator("a[href]").first();
    await expect(anyLink).toBeAttached();
  });
});
