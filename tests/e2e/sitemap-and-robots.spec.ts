// SEO surface smoke — guards the multi-sitemap + AI-crawler-aware robots
// surface and the LLM ingestion plaintext endpoints.
//
// Surfaces under test:
//   /sitemap.xml          — sitemap index referencing the three buckets
//   /sitemap-pages.xml    — static + category pages
//   /sitemap-repos.xml    — per-repo entries (image extension)
//   /sitemap-news.xml     — news/funding (news extension; may be empty)
//   /robots.txt           — public allowlist + AI-crawler block + sitemaps
//   /llms.txt             — short LLM-readable index
//   /llms-full.txt        — long-form LLM ingestion document
//
// We hit these as raw HTTP requests (not page navigations) so we can
// assert content-type and body without a browser parser in the loop.

import { test, expect } from "@playwright/test";

test.describe("sitemap and robots", () => {
  test("/sitemap.xml is a sitemap index referencing all three buckets", async ({
    request,
  }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);

    const ct = res.headers()["content-type"] ?? "";
    expect(ct).toContain("application/xml");

    const body = await res.text();
    expect(body).toContain("<sitemapindex");
    expect(body).toContain("sitemap-pages.xml");
    expect(body).toContain("sitemap-repos.xml");
    expect(body).toContain("sitemap-news.xml");
  });

  test("/sitemap-pages.xml is a urlset that includes the homepage", async ({
    request,
  }) => {
    const res = await request.get("/sitemap-pages.xml");
    expect(res.status()).toBe(200);

    const body = await res.text();
    expect(body).toContain("<urlset");
    // Some <loc> entry must end with '/' (the homepage).
    expect(body).toMatch(/<loc>[^<]+\/<\/loc>/);
  });

  test("/sitemap-repos.xml is a urlset with the image namespace", async ({
    request,
  }) => {
    const res = await request.get("/sitemap-repos.xml");
    expect(res.status()).toBe(200);

    const body = await res.text();
    expect(body).toContain("<urlset");
    expect(body).toContain("xmlns:image=");
  });

  test("/sitemap-news.xml is a urlset with the news namespace", async ({
    request,
  }) => {
    const res = await request.get("/sitemap-news.xml");
    expect(res.status()).toBe(200);

    const body = await res.text();
    expect(body).toContain("<urlset");
    // News namespace must be declared even if there are zero entries.
    expect(body).toContain("xmlns:news=");
  });

  test("/robots.txt disallows admin/api/you, lists sitemap, and welcomes AI crawlers", async ({
    request,
  }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);

    const body = await res.text();
    expect(body).toMatch(/Disallow:\s*\/admin/);
    expect(body).toMatch(/Disallow:\s*\/api\//);
    expect(body).toMatch(/Disallow:\s*\/you/);
    expect(body).toMatch(/^Sitemap:\s*\S*sitemap\.xml/m);

    // At least one explicit AI crawler block — proves the allowlist
    // wasn't stripped by a misconfig.
    expect(body).toMatch(/User-agent:\s*GPTBot/i);
  });

  test("/llms.txt is plaintext starting with the canonical TrendingRepo header", async ({
    request,
  }) => {
    const res = await request.get("/llms.txt");
    expect(res.status()).toBe(200);

    const ct = res.headers()["content-type"] ?? "";
    expect(ct.toLowerCase()).toMatch(/^text\/plain/);

    const body = await res.text();
    expect(body.trimStart().startsWith("# TrendingRepo")).toBe(true);
  });

  test("/llms-full.txt is plaintext containing the first repo block heading", async ({
    request,
  }) => {
    const res = await request.get("/llms-full.txt");
    expect(res.status()).toBe(200);

    const ct = res.headers()["content-type"] ?? "";
    expect(ct.toLowerCase()).toMatch(/^text\/plain/);

    const body = await res.text();
    expect(body).toContain("## 1.");
  });
});
