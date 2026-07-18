// Homepage smoke — guards the current landing surface.
//
// Asserted invariants (chosen to be stable under reskin sweeps):
//   1. GET / returns 200 and document <title> mentions TrendingRepo.
//   2. Current route shell, page hero, and copy render.
//   3. Header + sidebar are visible at desktop width.

import { test, expect } from "@playwright/test";

test.describe("homepage", () => {
  test("loads with title, hero, header and sidebar", async ({
    page,
  }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBe(true);

    const title = await page.title();
    expect(title.toLowerCase()).toContain("trendingrepo");

    // Current route chrome and hero are stable hooks for the landing page.
    await expect(page.locator(".route-shell").first()).toBeVisible();
    await expect(page.locator(".page-head").first()).toBeVisible();

    // The current hero copy confirms the route content rendered.
    await expect(
      page.getByRole("heading", { name: /Trending.*radar for everything AI/i }),
    ).toBeVisible();

    // Header + sidebar are role-tagged in the layout chrome.
    await expect(page.getByRole("banner").first()).toBeVisible();
    // Desktop viewport (default 1280x720) has the sidebar visible —
    // it's hidden under md: breakpoint.
    const sidebar = page.locator("aside").first();
    await expect(sidebar).toBeVisible();
  });
});
