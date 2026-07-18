// Mobile sidebar smoke — guards the shell's narrow-screen navigation.
//
// Invariants:
//   1. At iPhone-SE-class viewport (375x667), the hamburger button is visible.
//   2. Clicking it slides the drawer in (we look for the drawer panel).
//   3. Pressing Escape closes the drawer.
//
// The shell toggles the sidebar's `open` class and closes it on Escape.

import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 375, height: 667 } });

test.describe("mobile drawer", () => {
  test("opens via hamburger and closes via escape", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await page.waitForFunction(() => {
      const sidebar = document.querySelector("aside.sidebar");
      const openButton = document.querySelector('button[aria-label="Toggle sidebar"]');
      return (
        window.matchMedia("(max-width: 767.98px)").matches &&
        sidebar !== null &&
        openButton !== null &&
        getComputedStyle(sidebar).display === "none" &&
        getComputedStyle(openButton).display !== "none"
      );
    });

    const hamburger = page.getByRole("button", { name: /toggle sidebar/i }).first();
    await expect(hamburger).toBeVisible({ timeout: 10_000 });

    const drawer = page.locator("aside.sidebar");
    await hamburger.click();
    await expect(drawer).toHaveClass(/\bopen\b/);
    await expect(drawer).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(drawer).not.toHaveClass(/\bopen\b/);
  });
});
