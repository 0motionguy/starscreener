// Homepage smoke — guards the trending hub landing surface.
//
// Asserted invariants (chosen to survive reskin sweeps — the chrome gets
// redesigned often, so we hook onto the stable hub skeleton only):
//   1. GET / returns 200 and document <title> mentions TrendingRepo.
//   2. The .page-head hero (TrendingHubHero) renders with its .page-title.
//   3. FeaturedRepos renders: at least one /repo/ detail link is attached.
//
// Removed vs the V4 spec: .home-surface (V5 shell dropped it), .v2-bubble
// BubbleMap (component no longer mounted on home; only the physics hook
// survives), and banner/aside chrome (legacy Header/Sidebar deleted — see
// the header comment in src/app/layout.tsx).

import { test, expect } from "@playwright/test";

test.describe("homepage", () => {
  test("loads with title, page-head hero, and repo links", async ({
    page,
  }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBe(true);

    const title = await page.title();
    expect(title.toLowerCase()).toContain("trendingrepo");

    // Hub hero — TrendingHubHero renders .page-head with a .page-title h1.
    await expect(page.locator(".page-head").first()).toBeVisible();
    await expect(page.locator(".page-title").first()).toBeVisible();

    // FeaturedRepos emits repo detail links server-side; under CI load
    // hydration can lag, so require attachment rather than visibility.
    await expect(page.locator('a[href^="/repo/"]').first()).toBeAttached({
      timeout: 30_000,
    });
  });
});
