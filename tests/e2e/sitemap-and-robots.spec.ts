// SEO surface smoke — guards /sitemap.xml and /robots.txt.
//
// Invariants for /sitemap.xml:
//   1. GET returns 200, content-type starts with application/xml.
//   2. Body contains <urlset and at least one <loc> entry.
//
// Invariants for /robots.txt:
//   1. GET returns 200.
//   2. Body disallows /admin, /api/, /you and exposes a Sitemap: line so
//      crawlers can find the sitemap.
//
// We hit these as raw HTTP requests (not page navigations) so we can
// assert content-type and body without a browser parser in the loop.

import { test, expect } from "@playwright/test";

test.describe("sitemap and robots", () => {
  test("/sitemap.xml is well-formed XML with at least one <loc>", async ({
    request,
  }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);

    const ct = res.headers()["content-type"] ?? "";
    expect(ct).toContain("application/xml");

    const body = await res.text();
    expect(body).toContain("<urlset");
    expect(body).toMatch(/<loc>[^<]+<\/loc>/);
  });

  test("/robots.txt disallows admin/api/you and exposes Sitemap:", async ({
    request,
  }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);

    const body = await res.text();
    expect(body).toMatch(/Disallow:\s*\/admin/);
    expect(body).toMatch(/Disallow:\s*\/api\//);
    expect(body).toMatch(/Disallow:\s*\/you/);
    expect(body).toMatch(/^Sitemap:\s*\S+/m);
  });
});
