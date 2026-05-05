import { test, expect } from "@playwright/test";

test.describe("critical paths", () => {
  test("home -> signals -> repo detail", async ({ page }) => {
    const homeResponse = await page.goto("/", {
      waitUntil: "domcontentloaded",
    });
    expect(homeResponse?.ok()).toBe(true);
    await expect(page).toHaveTitle(/trendingrepo/i);
    await expect(page.locator(".home-surface").first()).toBeVisible();

    const signalsLink = page
      .getByRole("link", { name: /market signals|signals/i })
      .first();
    await expect(signalsLink).toBeVisible();
    await signalsLink.click();

    await expect(page).toHaveURL(/\/signals$/);
    await expect(page).toHaveTitle(/signals/i);
    await expect(page.locator("main").first()).toBeVisible();

    const repoLink = page
      .locator("main a[href^='/repo/'], a[href^='/repo/']")
      .first();
    await expect(repoLink).toBeVisible();
    await repoLink.click();

    await expect(page).toHaveURL(/\/repo\/[^/]+\/[^/]+/);
    await expect(page.locator("main").first()).toBeVisible();
  });
});
