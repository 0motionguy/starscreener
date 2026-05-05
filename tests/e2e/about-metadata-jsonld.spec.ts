import { expect, test } from "@playwright/test";

test.describe("about page metadata + json-ld", () => {
  test("/about renders title and parseable AboutPage JSON-LD", async ({ page }) => {
    const response = await page.goto("/about", { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBe(true);

    await expect(page).toHaveTitle(/about trendingrepo/i);
    await expect(page.getByRole("heading", { level: 1, name: /trend radar for open source/i })).toBeVisible();

    const scripts = page.locator('script[type="application/ld+json"]');
    await expect(scripts).toHaveCount(1);

    const raw = (await scripts.first().textContent()) ?? "";
    expect(raw.trim().length).toBeGreaterThan(0);

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed["@context"]).toBe("https://schema.org");
    expect(parsed["@type"]).toBe("AboutPage");
    expect(typeof parsed.url).toBe("string");
    expect(String(parsed.url)).toMatch(/\/about$/);
    expect(parsed.name).toBe("About TrendingRepo");
  });
});
