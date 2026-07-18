// Ideas smoke — guards /ideas public idea feed.
//
// Invariants:
//   1. GET /ideas returns 200.
//   2. The Ideas Board label and current heading mount.
//   3. The ideas-list container is attached in populated and empty states.
//
// We deliberately do not assert idea card contents — those depend on
// downstream reaction counts and Stripe-style hot scoring, which is
// data-driven.

import { test, expect } from "@playwright/test";

test.describe("ideas", () => {
  test("renders the board heading and list", async ({ page }) => {
    const response = await page.goto("/ideas", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.ok()).toBe(true);

    await expect(page.getByText(/IDEAS BOARD/i).first()).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Build the thing that doesn't exist yet/i }),
    ).toBeVisible();
    await expect(page.locator(".ideas-list").first()).toBeAttached();
  });
});
