// Homepage smoke — guards the V3 landing surface.
//
// Asserted invariants (chosen to be stable under reskin sweeps):
//   1. GET / returns 200 and document <title> mentions TrendingRepo.
//   2. The TerminalBar chrome around the BubbleMap renders.
//   3. The BubbleMap mounts at least one bubble disk (catches broken hydration).
//   4. Header + sidebar are visible at desktop width.
//
// Selectors avoid brittle CSS where possible — class hooks (.v2-term-bar,
// .v2-bubble) are part of the V2 design contract and policed by lint:tokens.

import { test, expect } from "@playwright/test";

test.describe("homepage", () => {
  test("loads with title, bubble map, header and sidebar", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBe(true);

    const title = await page.title();
    expect(title.toLowerCase()).toContain("trendingrepo");

    // Terminal bar chrome — BubbleMap card frame.
    const terminalBar = page.locator(".v2-term-bar").first();
    await expect(terminalBar).toBeVisible();

    // BubbleMap canvas hydrated — at least one bubble mounts after the
    // layout pass that runs post-commit.
    const bubble = page.locator(".v2-bubble").first();
    await expect(bubble).toBeAttached({ timeout: 15_000 });

    // Header + sidebar are role-tagged in the layout chrome.
    await expect(page.getByRole("banner").first()).toBeVisible();
    // Desktop viewport (default 1280x720) has the sidebar visible —
    // it's hidden under md: breakpoint.
    const sidebar = page.locator("aside").first();
    await expect(sidebar).toBeVisible();
  });
});
