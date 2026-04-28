// Repo detail smoke — guards /repo/:owner/:name.
//
// Invariants:
//   1. GET /repo/vercel/next.js returns 200 (the repo is in our seeded set).
//   2. The TerminalBar header reads "// REPO · VERCEL/NEXT.JS".
//   3. The breadcrumb renders ("Home › vercel/next.js").
//   4. At least one panel from the V3 18-panel layout mounts.
//
// If the seed data ever changes such that vercel/next.js isn't tracked, the
// page should still 404 cleanly — the test will surface that as a failure
// and prompt a seed update.

import { test, expect } from "@playwright/test";

test.describe("repo detail", () => {
  test("renders title, breadcrumb, and at least one panel", async ({ page }) => {
    const response = await page.goto("/repo/vercel/next.js", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.ok()).toBe(true);

    // Breadcrumb — Home link + the repo full name.
    const breadcrumb = page.getByRole("navigation", { name: /breadcrumb/i }).first();
    await expect(breadcrumb).toBeVisible();
    await expect(breadcrumb).toContainText("vercel/next.js");

    // Terminal-bar repo identity — case-insensitive because the bar uppercases.
    const terminalBar = page.locator(".v2-term-bar").first();
    await expect(terminalBar).toBeVisible();
    await expect(terminalBar).toContainText(/REPO/i);
    await expect(terminalBar).toContainText(/vercel\/next\.js/i);

    // V3 panel chrome — at least one .v2-frame block is mounted.
    const panel = page.locator(".v2-frame").first();
    await expect(panel).toBeAttached();
  });
});
