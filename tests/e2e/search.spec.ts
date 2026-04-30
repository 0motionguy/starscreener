// Search smoke — guards /search empty state + query handoff.
//
// Invariants (V4):
//   1. GET /search returns 200 and renders the .page-head hero.
//   2. The h1 reads "Search every repo in the live index." (V4 chrome).
//   3. The SearchBar input is mounted and accepts a query.
//   4. Typing "react" + pressing Enter pushes the URL to /search?q=react
//      and the page survives — the .page-head still renders.

import { test, expect } from "@playwright/test";

test.describe("search", () => {
  test("loads page-head hero and accepts a query", async ({ page }) => {
    const response = await page.goto("/search", { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBe(true);

    // V4-style page-head hero — replaces the V3 // SEARCH · GLOBAL eyebrow.
    const pageHead = page.locator(".page-head").first();
    await expect(pageHead).toBeVisible();
    await expect(pageHead.locator("h1")).toContainText(/search every repo/i);

    // SearchBar input — placeholder is "Search repos..." (see SearchBar.tsx).
    const searchInput = page.getByPlaceholder(/Search repos/i).first();
    await expect(searchInput).toBeVisible();

    await searchInput.fill("react");
    await searchInput.press("Enter");

    await expect(page).toHaveURL(/\/search\?q=react/i, { timeout: 10_000 });

    // Page survived the navigation — the page-head still renders.
    await expect(page.locator(".page-head").first()).toBeVisible();
  });
});
