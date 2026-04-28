// Signals smoke — guards /signals cross-source aggregator.
//
// Invariants:
//   1. GET /signals returns 200.
//   2. The V3 NewsTopHeaderV3 chrome renders with the
//      "// MARKET SIGNALS" eyebrow (the actual string is
//      "// MARKET SIGNALS · ALL SOURCES" — we match the prefix to stay
//      reskin-tolerant if the suffix is renamed).
//   3. The per-source bar chart card renders with the
//      "// VOLUME · PER SOURCE" title.
//   4. At least one source row is present — we look for any of the
//      five source labels (HACKERNEWS / BLUESKY / DEV.TO / LOBSTERS /
//      REDDIT) being attached to the DOM.

import { test, expect } from "@playwright/test";

test.describe("signals", () => {
  test("renders V3 header eyebrow, per-source bar chart, source rows", async ({
    page,
  }) => {
    const response = await page.goto("/signals", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.ok()).toBe(true);

    // V3 eyebrow row — match MARKET SIGNALS prefix.
    await expect(
      page.getByText(/\/\/\s*MARKET SIGNALS/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Per-source bar chart card title.
    await expect(
      page.getByText(/\/\/\s*VOLUME.*PER SOURCE/i).first(),
    ).toBeVisible();

    // At least one of the source labels is attached. Use a single
    // alternation regex so the match is one network-stable lookup.
    const sourceLabel = page
      .getByText(/\b(HACKERNEWS|BLUESKY|DEV\.TO|LOBSTERS|REDDIT)\b/i)
      .first();
    await expect(sourceLabel).toBeAttached();
  });
});
