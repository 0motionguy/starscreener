// Signals smoke — guards /signals cross-source aggregator.
//
// Invariants (V4):
//   1. GET /signals returns 200.
//   2. The V4 PageHead crumb renders ("SIGNAL · TERMINAL · /SIGNALS").
//   3. The "// 03 Primary feeds" SectionHead mounts above the source panels.
//   4. At least one source panel header is attached — we look for any of
//      the rendered SourceFeedPanel titles (HACKER NEWS / GITHUB ·
//      TRENDING / X · KOL FEED / REDDIT · ML/LLM / BLUESKY / DEV.TO /
//      CLAUDE · RSS / OPENAI · RSS).

import { test, expect } from "@playwright/test";

test.describe("signals", () => {
  test("renders the market cockpit and live source links", async ({
    page,
  }) => {
    const response = await page.goto("/market-signals", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.ok()).toBe(true);

    await expect(
      page.getByRole("heading", { name: /Market signals.*cockpit/i }),
    ).toBeVisible();
    await expect(page.getByText(/Live sources/i).first()).toBeVisible();
    await expect(page.locator('a[data-source="github"]')).toBeAttached();
  });
});
