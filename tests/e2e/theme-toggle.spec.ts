// Theme toggle smoke — guards next-themes wiring + persistence.
//
// Invariants:
//   1. There is a theme toggle button in the page (header + sidebar footer
//      both render one — we pick whichever is visible at desktop width).
//   2. Clicking it flips the <html> class between dark/light.
//   3. The persistent storage key (`trendingrepo-theme`) updates.
//
// Default theme is "dark" (per ThemeProvider). After one click we expect
// "light"; ARIA label flips between "Switch to light mode" / "Switch to
// dark mode" so we use the toggle's label as the post-click oracle.

import { test, expect } from "@playwright/test";

test.describe("theme toggle", () => {
  // SKIPPED: ThemeToggle was removed in commit 84090fe5 (per
  // ultra-audit-2026-05-02 finding V4: "V4 is dark-only per
  // DESIGN_SYSTEM.md § 1"). Test left in place as a future scaffold if
  // light-mode is ever reintroduced. Until then this was the only failing
  // CI check on every PR including main itself.
  test.skip("flips html class and persists to localStorage", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Wait for client mount — ThemeToggle renders a placeholder until then.
    const toggle = page
      .getByRole("button", { name: /Switch to (light|dark) mode/i })
      .first();
    await expect(toggle).toBeVisible({ timeout: 10_000 });

    // Capture the before state of the <html> class list.
    const before = await page.evaluate(() =>
      document.documentElement.classList.contains("dark") ? "dark" : "light",
    );

    await toggle.click();

    // Expect the class list to flip.
    const expectedAfter = before === "dark" ? "light" : "dark";
    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            document.documentElement.classList.contains("dark") ? "dark" : "light",
          ),
        { timeout: 5_000 },
      )
      .toBe(expectedAfter);

    // localStorage updates under the next-themes storage key.
    const stored = await page.evaluate(() =>
      window.localStorage.getItem("trendingrepo-theme"),
    );
    expect(stored).toBe(expectedAfter);
  });
});
