// Mobile drawer smoke — guards the lazy-loaded MobileDrawerLazy.
//
// Invariants:
//   1. At iPhone-SE-class viewport (375x667), the hamburger button is visible.
//   2. Clicking it slides the drawer in (we look for the drawer panel).
//   3. Pressing Escape closes the drawer.
//
// The HamburgerButton uses aria-label="Open menu". MobileDrawer is
// scoped to md:hidden; the framer-motion AnimatePresence mounts the panel
// only when the store flag flips true.

import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 375, height: 667 } });

test.describe("mobile drawer", () => {
  test("opens via hamburger and closes via escape", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const hamburger = page.getByRole("button", { name: /open menu/i }).first();
    await expect(hamburger).toBeVisible({ timeout: 10_000 });

    await hamburger.click();

    // Drawer panel mounts after the lazy chunk loads + AnimatePresence
    // commits. We look for the close button injected by MobileDrawer
    // ("Close menu") OR the menu eyebrow as fallback.
    const closeButton = page.getByRole("button", { name: /close menu/i }).first();
    await expect(closeButton).toBeVisible({ timeout: 10_000 });

    await page.keyboard.press("Escape");
    await expect(closeButton).not.toBeVisible({ timeout: 10_000 });
  });
});
