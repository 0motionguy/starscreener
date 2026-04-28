// Search smoke — guards /search empty state + query handoff.
//
// Invariants:
//   1. GET /search returns 200 and shows the empty-state prompt.
//   2. Typing "react" + pressing Enter pushes the URL to /search?q=react
//      and renders WITHOUT crashing. Result content is not asserted —
//      seed data may or may not contain React; both outcomes are valid
//      so long as the page doesn't blow up.

import { test, expect } from "@playwright/test";

test.describe("search", () => {
  test("loads empty-state copy and accepts a query", async ({ page }) => {
    const response = await page.goto("/search", { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBe(true);

    // Empty-state mono comment.
    await expect(
      page.getByText(/START TYPING TO SEARCH/i).first(),
    ).toBeVisible();

    // SearchBar input — aria-label mirrors the placeholder.
    const input = page.getByRole("combobox").first().or(
      page.getByPlaceholder(/Search repos/i).first(),
    );
    // Either resolves; prefer a placeholder-based match.
    const searchInput = page.getByPlaceholder(/Search repos/i).first();
    await expect(searchInput).toBeVisible();

    await searchInput.fill("react");
    await searchInput.press("Enter");

    await expect(page).toHaveURL(/\/search\?q=react/i, { timeout: 10_000 });

    // Page is not in a crashed state — the search heading section still mounts.
    await expect(page.getByText(/SEARCH · GLOBAL/i).first()).toBeVisible();
    void input; // dual-locator kept for future debugging
  });
});
