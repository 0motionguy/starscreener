// Repo detail smoke - guards /repo/:owner/:name.
//
// Invariants:
//   1. GET /repo/vercel/next.js returns 200 (the repo is in our seeded set).
//   2. The profile-parity hero renders with "vercel" + "next.js".
//   3. The current repo-detail body chrome mounts.
//   4. The star-history card does not trip the Chart.js registry at runtime.
//
// If the seed data ever changes such that vercel/next.js isn't tracked, the
// page should still 404 cleanly - the test will surface that as a failure
// and prompt a seed update.

import { test, expect } from "@playwright/test";

test.describe("repo detail", () => {
  test("renders title, crumb, chart shell, and body chrome", async ({ page }) => {
    const runtimeErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(message.text());
    });
    page.on("pageerror", (error) => runtimeErrors.push(error.message));

    const response = await page.goto("/repo/vercel/next.js", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.ok()).toBe(true);

    const hero = page.locator(".pf-hero").first();
    await expect(hero).toBeVisible();
    await expect(hero).toContainText(/vercel\s*\/\s*next\.js/i);

    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }),
    ).toContainText(/vercel\/next\.js/i);
    await expect(page.locator(".pf-section").first()).toBeVisible();

    const chart = page.locator(".pf-chart-card").first();
    await expect(chart).toBeVisible();
    await expect(chart).toContainText(/star history/i);
    await expect(
      chart.locator("canvas, .pf-chart-empty").first(),
    ).toBeVisible();

    await expect(page.locator("[data-nextjs-error-boundary]")).toHaveCount(0);
    expect(
      runtimeErrors.filter((message) =>
        /registered controller|repo\/\[owner\]\/\[name\]/i.test(message),
      ),
    ).toEqual([]);
  });
});
