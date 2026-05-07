// AGN-912 snapshot — locks the /githubrepo metadata head block so a future
// edit can't silently drop canonical / OG / Twitter / robots fields. The
// SEO audit (AGN-790) flagged this surface as the most critical zero-meta
// page; AGN-791 added partial values; AGN-912 finished the head and added
// this guardrail.
//
// SITE_URL is module-load-time resolved from NEXT_PUBLIC_APP_URL — pin it
// before importing the page so the canonical / OG URL assertions stay
// deterministic regardless of the local host env.

import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://trendingrepo.com";
});

async function loadMetadata() {
  const mod = await import("../page");
  return mod.metadata;
}

describe("GET /githubrepo metadata", () => {
  it("matches the locked SEO head snapshot", async () => {
    const metadata = await loadMetadata();
    expect(metadata).toMatchInlineSnapshot(`
      {
        "alternates": {
          "canonical": "https://trendingrepo.com/githubrepo",
        },
        "description": "Top 50 trending GitHub repos ranked by Trendshift + OSS Insight — the two upstreams with the strongest daily signal. Each row shows where it placed on each source. Repos appearing on both float to the top.",
        "openGraph": {
          "description": "Top 50 trending GitHub repos ranked by Trendshift + OSS Insight — the two upstreams with the strongest daily signal. Each row shows where it placed on each source. Repos appearing on both float to the top.",
          "images": [
            {
              "alt": "TrendingRepo — top 50 trending GitHub repositories, live",
              "height": 630,
              "url": "/og-card.png",
              "width": 1200,
            },
          ],
          "locale": "en_US",
          "siteName": "TrendingRepo",
          "title": "Top 50 trending GitHub repos — live — TrendingRepo",
          "type": "website",
          "url": "https://trendingrepo.com/githubrepo",
        },
        "robots": {
          "follow": true,
          "googleBot": {
            "follow": true,
            "index": true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
          },
          "index": true,
        },
        "title": "Top 50 trending GitHub repos — live",
        "twitter": {
          "card": "summary_large_image",
          "creator": "@0motionguy",
          "description": "Top 50 trending GitHub repos ranked by Trendshift + OSS Insight — the two upstreams with the strongest daily signal. Each row shows where it placed on each source. Repos appearing on both float to the top.",
          "images": [
            "/og-card.png",
          ],
          "site": "@0motionguy",
          "title": "Top 50 trending GitHub repos — live — TrendingRepo",
        },
      }
    `);
  });

  it("exposes an absolute canonical URL", async () => {
    const metadata = await loadMetadata();
    expect(metadata.alternates?.canonical).toBe(
      "https://trendingrepo.com/githubrepo",
    );
  });

  it("declares OG image dimensions and alt text", async () => {
    const metadata = await loadMetadata();
    const images = metadata.openGraph?.images;
    expect(Array.isArray(images)).toBe(true);
    const first = (images as Array<{ width?: number; height?: number; alt?: string }>)[0];
    expect(first?.width).toBe(1200);
    expect(first?.height).toBe(630);
    expect(first?.alt).toMatch(/TrendingRepo/);
  });

  it("opts the page in to indexing with an explicit robots block", async () => {
    const metadata = await loadMetadata();
    expect(metadata.robots).toMatchObject({
      index: true,
      follow: true,
      googleBot: { index: true, follow: true },
    });
  });
});
