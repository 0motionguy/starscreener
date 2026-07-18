// Watchlist smoke — guards /watchlist cold (empty) state + CTA wiring.
//
// Invariants:
//   1. GET /watchlist returns 200.
//   2. The "// WATCHLIST IS EMPTY" mono comment is visible (cold state —
//      we never seed localStorage in this spec).
//   3. The "BROWSE TRENDING REPOS" CTA navigates back to /.

import { test, expect } from "@playwright/test";

test.describe("watchlist", () => {
  test("shows empty state and CTA navigates home", async ({ page }) => {
    const response = await page.goto("/tools/watchlist", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.ok()).toBe(true);

    // The local-storage-backed watchlist hydrates to its empty state.
    await expect(
      page.getByText(/No repos pinned/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // The empty-state CTA returns to the discovery surface.
    const cta = page.getByRole("link", { name: /trending hub/i });
    await expect(cta).toBeVisible();

    await cta.click();
    await expect(page).toHaveURL(/\/$|^\/(\?.*)?$/, { timeout: 10_000 });
  });
});
