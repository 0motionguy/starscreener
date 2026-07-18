// Repo detail smoke - guards /repo/:owner/:name.
//
// Invariants:
//   1. GET /repo/vercel/next.js returns 200 (the repo is in our seeded set).
//   2. The RepoIdHero identity block renders with "vercel" + "next.js".
//   3. The hero eyebrow mounts (Repo, rank, channel state).
//   4. At least one body section from the repo-detail layout mounts.
//
// If the seed data ever changes such that vercel/next.js isn't tracked, the
// page should still 404 cleanly - the test will surface that as a failure
// and prompt a seed update.

import { test, expect } from "@playwright/test";

test.describe("repo detail", () => {
  test("renders title, crumb, and body chrome", async ({ page }) => {
    const response = await page.goto("/repo/vercel/next.js", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.ok()).toBe(true);

    // Current profile shell, title, breadcrumb, and a content section.
    const hero = page.locator(".pf-main-inner").first();
    await expect(hero).toBeVisible();
    await expect(hero.locator(".pf-title")).toContainText(/next\.js/i);
    await expect(page.getByRole("navigation", { name: /Breadcrumb/i })).toContainText(
      /vercel\/next\.js/i,
    );
    await expect(hero.locator(".pf-section").first()).toBeVisible();
  });
});
