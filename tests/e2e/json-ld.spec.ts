// JSON-LD smoke — guards structured-data on / and /repo/:owner/:name.
//
// Invariants for `/`:
//   1. >= 5 <script type="application/ld+json"> tags emitted (WebSite,
//      Organization, BreadcrumbList, FAQPage, CollectionPage with
//      ItemList).
//   2. Each script body parses as JSON via JSON.parse and is non-empty.
//
// Invariants for `/repo/vercel/next.js`:
//   1. >= 2 <script type="application/ld+json"> tags emitted
//      (SoftwareSourceCode + BreadcrumbList).
//   2. Each script body parses as JSON via JSON.parse and is non-empty.
//
// We do not assert exact @type values or field shapes — drift in the
// generators is tracked by the unit tests in src/lib/__vitest__/seo.test.ts.

import { test, expect } from "@playwright/test";

async function expectAllJsonLdParse(
  page: import("@playwright/test").Page,
  minCount: number,
) {
  const locator = page.locator('script[type="application/ld+json"]');

  // Server-rendered scripts are emitted at the same time as the document
  // shell, but Playwright's `count()` resolves before Next's streaming
  // response is fully consumed in dev mode. Poll until we see at least
  // `minCount` tags or the expect timeout fires.
  await expect.poll(async () => locator.count(), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(minCount);

  const scripts = await locator.evaluateAll((nodes) =>
    nodes.map((node) => node.textContent ?? ""),
  );
  for (const raw of scripts) {
    expect(raw.trim().length).toBeGreaterThan(0);
    // Throws on malformed JSON — that's the assertion.
    const parsed = JSON.parse(raw);
    // Non-empty: object with at least one key, or non-empty array.
    if (Array.isArray(parsed)) {
      expect(parsed.length).toBeGreaterThan(0);
    } else {
      expect(typeof parsed).toBe("object");
      expect(parsed).not.toBeNull();
      expect(Object.keys(parsed).length).toBeGreaterThan(0);
    }
  }
}

test.describe("json-ld", () => {
  test("homepage emits >=5 ld+json scripts and all parse", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBe(true);

    await expectAllJsonLdParse(page, 5);
  });

  test("repo detail emits >=2 ld+json scripts and all parse", async ({
    page,
  }) => {
    const response = await page.goto("/repo/vercel/next.js", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.ok()).toBe(true);

    await expectAllJsonLdParse(page, 2);
  });
});
