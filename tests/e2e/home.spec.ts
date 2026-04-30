// Homepage smoke — guards the V4 landing surface.
//
// Asserted invariants (chosen to be stable under reskin sweeps):
//   1. GET / returns 200 and document <title> mentions TrendingRepo.
//   2. The .home-surface chrome renders (page-head hero pattern; replaces
//      the older v2-term-bar assertion the V3 home rewrite removed).
//   3. The BubbleMap mounts at least one bubble disk (catches broken
//      hydration). .v2-bubble is the canvas overlay class emitted by
//      BubbleMapCanvas; under CI load hydration can take 20+ seconds.
//   4. Header + sidebar are visible at desktop width.

import { test, expect } from "@playwright/test";

test.describe("homepage", () => {
  test("loads with title, page-head, bubble map, header and sidebar", async ({
    page,
  }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBe(true);

    const title = await page.title();
    expect(title.toLowerCase()).toContain("trendingrepo");

    // Home surface chrome — replaces .v2-term-bar (which the V3 home
    // rewrite removed). The page-head hero block is the stable hook.
    await expect(page.locator(".home-surface").first()).toBeVisible();
    await expect(page.locator(".page-head").first()).toBeVisible();

    // BubbleMap canvas hydrated — at least one bubble mounts after the
    // layout pass that runs post-commit. Bumped from 15 s → 30 s for CI.
    const bubble = page.locator(".v2-bubble").first();
    await expect(bubble).toBeAttached({ timeout: 30_000 });

    // Header + sidebar are role-tagged in the layout chrome.
    await expect(page.getByRole("banner").first()).toBeVisible();
    // Desktop viewport (default 1280x720) has the sidebar visible —
    // it's hidden under md: breakpoint.
    const sidebar = page.locator("aside").first();
    await expect(sidebar).toBeVisible();
  });
});
