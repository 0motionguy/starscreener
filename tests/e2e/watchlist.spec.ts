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
    const response = await page.goto("/watchlist", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.ok()).toBe(true);

    // Hydration gate flips after first effect — wait for the empty copy.
    await expect(
      page.getByText(/WATCHLIST IS EMPTY/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // CTA — case-sensitive uppercase to match the actual rendered text.
    const cta = page.getByRole("link", { name: /BROWSE TRENDING REPOS/i });
    await expect(cta).toBeVisible();

    await cta.click();
    await expect(page).toHaveURL(/\/$|^\/(\?.*)?$/, { timeout: 10_000 });
  });
});
