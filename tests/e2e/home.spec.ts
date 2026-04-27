// Homepage smoke — answers "did /home still load?" after a 50-commit run.
//
// Asserted invariants (chosen to be stable under V2/V3 reskins):
//   1. The page returns 200 and the document has a sensible <title>.
//   2. WebSite + FAQPage JSON-LD blocks both render — these are visible
//      to crawlers; if they break, SEO breaks silently.
//   3. The TerminalBar chrome around the BubbleMap renders (.v2-term-bar).
//   4. The BubbleMap mounts at least one bubble (.v2-bubble disk inside an
//      <svg>). The bubble layout is JS-driven; if hydration is broken we
//      get a skeleton with no bubbles — this catches that.
//
// Selectors are class-based (v2-term-bar, v2-bubble) because those are
// already part of the V2 design contract and assert against the same
// invariants the lint:tokens guard polices.

import { test, expect } from "@playwright/test";

test.describe("homepage", () => {
  test("loads with title, JSON-LD, terminal chrome, and bubble map", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBe(true);

    // Title check is loose so a pre-launch tagline tweak doesn't flake the
    // smoke test — we just want SOMETHING set.
    const title = await page.title();
    expect(title.trim().length).toBeGreaterThan(0);

    // Crawler-visible structured data. Both blocks are inline, so a quick
    // count is enough; their bodies are unit-tested via the safeJsonLd helper.
    const jsonLd = page.locator('script[type="application/ld+json"]');
    await expect(jsonLd).toHaveCount(await jsonLd.count()); // settles the locator
    expect(await jsonLd.count()).toBeGreaterThanOrEqual(2);

    const ldTypes = await jsonLd.allTextContents();
    const joined = ldTypes.join("\n");
    expect(joined).toContain('"@type":"WebSite"');
    expect(joined).toContain('"@type":"FAQPage"');

    // BubbleMap chrome — the v2-card frame uses TerminalBar at the top.
    const terminalBar = page.locator(".v2-term-bar").first();
    await expect(terminalBar).toBeVisible();

    // BubbleMap canvas hydrated — wait for at least one bubble disk to mount.
    // The canvas runs a layout pass after the React tree commits, so the SVG
    // exists immediately but the bubbles take a beat.
    const bubble = page.locator(".v2-bubble").first();
    await expect(bubble).toBeAttached({ timeout: 15_000 });
  });
});
