// Repo detail smoke — guards /repo/:owner/:name.
//
// Invariants (V4 / W5 migration):
//   1. GET /repo/vercel/next.js returns 200 (the repo is in our seeded set).
//   2. The PageHead inside ProfileTemplate renders the V4 crumb + repo name.
//   3. The VerdictRibbon mounts (per-repo verdict).
//   4. The ProfileTemplate body renders with mainPanels content.
//
// If the seed data ever changes such that vercel/next.js isn't tracked, the
// page should still 404 cleanly — the test will surface that as a failure
// and prompt a seed update.

import { test, expect } from "@playwright/test";

test.describe("repo detail", () => {
  test("renders V4 head, verdict, and body chrome", async ({ page }) => {
    const response = await page.goto("/repo/vercel/next.js", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.ok()).toBe(true);

    // ProfileTemplate root — V4 page shell.
    const template = page.locator(".v4-profile-template").first();
    await expect(template).toBeAttached();

    // PageHead — repo identity hero.
    const head = page.locator(".v4-page-head").first();
    await expect(head).toBeVisible();
    await expect(head).toContainText(/vercel/i);
    await expect(head).toContainText(/next\.js/i);

    // V4 crumb prefixed REPO eyebrow.
    const crumb = head.locator(".v4-page-head__crumb").first();
    await expect(crumb).toBeVisible();
    await expect(crumb).toContainText(/REPO/i);

    // VerdictRibbon — per-repo ranking + cross-signal score.
    const verdict = page.locator(".v4-verdict-ribbon").first();
    await expect(verdict).toBeVisible();

    // Body main column mounts (mainPanels slot).
    const main = page.locator(".v4-profile-template__main").first();
    await expect(main).toBeAttached();
  });
});
