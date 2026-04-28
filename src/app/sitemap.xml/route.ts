// TrendingRepo — sitemap index (top of the multi-sitemap tree).
//
// References four sub-sitemaps:
//   /sitemap-pages.xml   — static hubs + categories + collections + per-source pages
//   /sitemap-repos.xml   — every tracked repo (image-extension, archived filter)
//   /sitemap-news.xml    — Google News protocol over the live HN/PH/devto/lobsters feeds
//   /sitemap-digest.xml  — /digest hub + every dated daily-trending snapshot URL
//   (future: /sitemap-repos-2.xml etc. via pagination if we cross 50k repos)
//
// Cache: revalidate hourly via the route handler's cache-control header
// (handled by xmlResponse). Vercel edge cache + crawler-side cache absorb
// the bursts at indexing time.

import { absoluteUrl } from "@/lib/seo";
import {
  renderSitemapIndex,
  xmlResponse,
} from "@/lib/sitemap-xml";

export const revalidate = 3600;
export const dynamic = "force-static";

export function GET(): Response {
  const now = new Date();
  const xml = renderSitemapIndex([
    { loc: absoluteUrl("/sitemap-pages.xml"), lastmod: now },
    { loc: absoluteUrl("/sitemap-repos.xml"), lastmod: now },
    { loc: absoluteUrl("/sitemap-news.xml"), lastmod: now },
    { loc: absoluteUrl("/sitemap-digest.xml"), lastmod: now },
  ]);
  return xmlResponse(xml, 3600);
}
