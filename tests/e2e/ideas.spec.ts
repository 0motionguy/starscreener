// Ideas smoke — guards /ideas public idea feed.
//
// Invariants:
//   1. GET /ideas returns 200.
//   2. The TerminalBar eyebrow "// IDEAS · HOT" mounts (default sort).
//   3. Either the populated feed (data-testid="idea-feed") OR the
//      "No ideas yet in this view" empty-state mono comment is visible —
//      both are valid steady states depending on idea-store seed.
//
// We deliberately do not assert idea card contents — those depend on
// downstream reaction counts and Stripe-style hot scoring, which is
// data-driven.

import { test, expect } from "@playwright/test";

test.describe("ideas", () => {
  test("renders eyebrow and feed-or-empty-state", async ({ page }) => {
    const response = await page.goto("/ideas", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.ok()).toBe(true);

    // V2 TerminalBar eyebrow — default sort is HOT.
    await expect(
      page.getByText(/\/\/\s*IDEAS\s*·\s*HOT/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Either populated feed or empty state — both are valid.
    const feedOrEmpty = page
      .locator('[data-testid="idea-feed"]')
      .or(page.getByText(/No ideas yet in this view/i))
      .first();
    await expect(feedOrEmpty).toBeAttached({ timeout: 10_000 });
  });
});
