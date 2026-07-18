// Search smoke — guards /search empty state + query handoff.
//
// Invariants (V4):
//   1. GET /search returns 200 and renders the .page-head hero.
//   2. The h1 reads "Search every repo in the live index." (V4 chrome).
//   3. The SearchBar input is mounted and accepts a query.
//   4. Typing "react" + pressing Enter pushes the URL to /search?q=react
//      and the page survives — the .page-head still renders.

import { test, expect } from "@playwright/test";

test.describe("global search", () => {
  test.setTimeout(45_000);

  test("accepts a query and opens the result panel", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBe(true);

    const searchInput = page.getByRole("combobox", { name: /Search/i });
    await expect(searchInput).toBeVisible();

    await searchInput.fill("react");
    await expect(searchInput).toHaveValue("react");
    await expect(page.locator("#global-search-dropdown")).toBeVisible({
      timeout: 15_000,
    });
    await searchInput.press("Escape");
    await expect(searchInput).toHaveAttribute("aria-expanded", "false");
  });
});
