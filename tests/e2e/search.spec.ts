// /search retirement guard.
//
// The standalone search page was folded into the home hub during the V5
// consolidation; next.config.ts pins a permanent redirect /search → / so
// old backlinks + SERP entries keep resolving. This spec guards that
// contract (and catches anyone re-introducing a dead /search route or
// dropping the redirect by accident).

import { test, expect } from "@playwright/test";

test.describe("search route retirement", () => {
  test("GET /search permanently redirects to /", async ({ page }) => {
    const response = await page.request.fetch("/search", {
      maxRedirects: 0,
    });
    // next.config redirects with permanent: true → 308.
    expect(response.status()).toBe(308);
    // Location may be absolute (dev) or relative depending on server mode.
    const location = response.headers()["location"] ?? "";
    expect(location).toMatch(/^(https?:\/\/[^/]+)?\/$/);
  });
});
