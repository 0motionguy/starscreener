// Repo detail smoke — guards /repo/:owner/:name.
//
// Invariants:
//   1. GET /repo/vercel/next.js returns 200 (the repo is in our seeded set).
//   2. The .id-strip identity hero renders with "vercel" + "next.js".
//   3. The crumb inside .id-strip mounts (Repo · rank #N · …).
//   4. At least one body section from the repo-detail layout mounts.
//
// If the seed data ever changes such that vercel/next.js isn't tracked, the
// page should still 404 cleanly — the test will surface that as a failure
// and prompt a seed update.

import { test, expect } from "@playwright/test";

test.describe("repo detail", () => {
  test("renders title, crumb, and body chrome", async ({ page }) => {
    const response = await page.goto("/repo/vercel/next.js", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.ok()).toBe(true);

    // Identity strip — repo-detail's hero block.
    const idStrip = page.locator(".id-strip").first();
    await expect(idStrip).toBeVisible();
    await expect(idStrip).toContainText(/vercel/i);
    await expect(idStrip).toContainText(/next\.js/i);

    // Crumb inside the identity strip — replaces the V3 breadcrumb-role nav.
    const crumb = idStrip.locator(".crumb").first();
    await expect(crumb).toBeVisible();
    await expect(crumb).toContainText(/Repo/i);

    // Body chrome — at least the repo-detail stack mounts.
    const stack = page.locator(".repo-detail-stack").first();
    await expect(stack).toBeAttached();
  });
});
