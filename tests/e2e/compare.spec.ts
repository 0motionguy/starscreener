// Compare smoke — guards /compare/<owner>/<name>/vs/<owner>/<name>.
//
// The V5 compare surface is a server-rendered head-to-head page gated on
// both repos existing in the index (src/lib/compare-pairs.ts); the old
// /compare?repos=a,b query-param client page (Zustand hand-off + chart)
// was replaced wholesale, so this spec now guards the slug route:
//   1. GET /compare/<a>/vs/<b> returns 200 for an indexed pair.
//   2. The hero h1 reads "<a> vs <b>".
//   3. The side-by-side metrics table renders at least one metric row.
//
// Pair selection: scrape the first two distinct /repo/<owner>/<name> links
// from the home page — the server's own canonical index view. Reading
// data/trending.json directly is NOT rename-proof: when a repo is renamed
// upstream (e.g. anthropics/financial-services-plugins →
// anthropics/financial-services), the trending snapshot keeps the stale
// name while the registry/metadata layer canonicalizes to the new one, so
// the derived-index lookup misses and the page falls back to a live GitHub
// fetch that renders the renamed repo — failing any assertion pinned to
// the stale JSON name. Home links always reflect what the index resolves.

import { test, expect } from "@playwright/test";

async function pickPair(
  page: import("@playwright/test").Page,
): Promise<[string, string]> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // Same selector home.spec.ts guards, so a selector drift fails loudly
  // there first.
  await expect(page.locator('a[href^="/repo/"]').first()).toBeAttached({
    timeout: 15_000,
  });
  const hrefs = await page
    .locator('a[href^="/repo/"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? ""));
  const names = hrefs
    .map((h) => h.replace(/^\/repo\//, "").replace(/[?#].*$/, ""))
    .filter(
      (n) =>
        n.split("/").length === 2 &&
        n.split("/").every((part) => part.length > 0),
    );
  const a = names[0];
  const b = names.find((n) => n.toLowerCase() !== a?.toLowerCase());
  if (!a || !b) {
    throw new Error(
      "home page must link two distinct /repo/<owner>/<name> repos",
    );
  }
  // Canonical URL order — comparePath() sorts case-insensitively.
  return [a, b].sort((x, y) =>
    x.toLowerCase().localeCompare(y.toLowerCase()),
  ) as [string, string];
}

test.describe("compare", () => {
  test("renders head-to-head hero and metrics table", async ({ page }) => {
    const [a, b] = await pickPair(page);
    const response = await page.goto(`/compare/${a}/vs/${b}`, {
      waitUntil: "domcontentloaded",
    });
    expect(response?.ok()).toBe(true);

    // Hero — <header class="hero"> with h1 "<a> vs <b>".
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toContainText(" vs ");
    await expect(h1).toContainText(a);
    await expect(h1).toContainText(b);

    // Side-by-side metrics card + at least one data row.
    await expect(
      page.getByText(/Side-by-side metrics/i).first(),
    ).toBeVisible();
    await expect(page.locator("table.tdata tbody tr").first()).toBeVisible();
  });
});
