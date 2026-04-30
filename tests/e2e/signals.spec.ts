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
  test("renders V4 PageHead, primary-feeds section, and source panels", async ({
    page,
  }) => {
    const response = await page.goto("/signals", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.ok()).toBe(true);

    // V4 PageHead crumb — replaces the V3 // MARKET SIGNALS eyebrow.
    await expect(
      page.getByText(/SIGNAL\s*·\s*TERMINAL/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // SectionHead that owns the source-panel grid (replaces V3 //
    // VOLUME · PER SOURCE chart-card title).
    await expect(
      page.getByText(/Primary feeds/i).first(),
    ).toBeVisible();

    // At least one source panel header is attached. Single alternation
    // regex so the match is one network-stable lookup. SourceFeedPanel
    // titles are uppercase with spaces / dots / dashes.
    const sourceLabel = page
      .getByText(/\b(HACKER NEWS|GITHUB|REDDIT|BLUESKY|DEV\.TO|CLAUDE|OPENAI)\b/i)
      .first();
    await expect(sourceLabel).toBeAttached();
  });
});
