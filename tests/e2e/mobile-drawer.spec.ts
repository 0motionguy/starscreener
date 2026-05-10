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

    await page.waitForFunction(() => {
      const sidebar = document.querySelector("aside.sidebar");
      const openButton = document.querySelector(
        'button[aria-label="Open menu"]',
      );
      return (
        window.matchMedia("(max-width: 767.98px)").matches &&
        sidebar !== null &&
        openButton !== null &&
        getComputedStyle(sidebar).display === "none" &&
        getComputedStyle(openButton).display !== "none"
      );
    });

    const hamburger = page.getByRole("button", { name: /open menu/i }).first();
    await expect(hamburger).toBeVisible({ timeout: 10_000 });

    // Drawer panel mounts after the lazy chunk loads + AnimatePresence commits.
    const drawer = page.getByRole("dialog", { name: /navigation/i });
    await expect
      .poll(
        async () => {
          if (await drawer.isVisible().catch(() => false)) return true;
          await hamburger.click();
          return drawer.isVisible().catch(() => false);
        },
        { timeout: 15_000 },
      )
      .toBe(true);
    await expect(drawer).toBeVisible({ timeout: 15_000 });

    const closeButton = drawer.getByRole("button", { name: /close menu/i });
    await expect(closeButton).toBeVisible({ timeout: 10_000 });

    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible({ timeout: 10_000 });
  });
});
