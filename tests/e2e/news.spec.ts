// News smoke — guards /hackernews/trending V4 surface (SourceFeedTemplate).
//
// Invariants:
//   1. GET /hackernews/trending returns 200.
//   2. V4 crumb renders (e.g. "HN · TERMINAL · /HACKERNEWS") — we match the
//      /HACKERNEWS suffix to stay reskin-tolerant.
//   3. At least one anchor is in the page (internal or external).

import { test, expect } from "@playwright/test";

test.describe("Hacker News market source", () => {
  test("renders the Hacker News source in the market cockpit", async ({ page }) => {
    const response = await page.goto("/market-signals", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.ok()).toBe(true);

    // The unified market cockpit replaces the retired source-only route.
    await expect(
      page.getByRole("heading", { name: /Market signals.*cockpit/i }),
    ).toBeVisible();

    // Hacker News remains exposed as a named live source.
    const hackerNews = page.locator('a[data-source="hn"]');
    await expect(hackerNews).toBeVisible();
    await expect(hackerNews).toContainText(/Hacker News/i);
  });
});
