// TrendingRepo — pages sub-sitemap
//
// Role in the multi-sitemap pattern:
//   /sitemap.xml is a <sitemapindex> that points at this file plus the
//   per-source sub-sitemaps (repos, news, ...). This sub-sitemap covers
//   every static hub page, every category landing page, every curated
//   collection page, and the per-source signal hubs. Repo detail pages
//   live in sitemap-repos.xml; news items live in sitemap-news.xml.
//
// Why the image extension is declared at the urlset level:
//   Categories, collections, the breakouts hub, the compare hub, and the
//   homepage all ship a generated `opengraph-image` route. Surfacing
//   those to crawlers via the sitemap-image extension lets Google index
//   them as legitimate page imagery (preview cards, image search).
//   Pages that have no meaningful OG image — `/docs`, `/search`,
//   `/submit`, etc. — simply omit the `images` field on
//   their UrlEntry; the renderer skips the `<image:image>` block when
//   `images` is absent or empty, so we pay zero bytes for entries that
//   don't have an image.
//
// Caching:
//   ISR-revalidated hourly (`revalidate = 3600`) and force-static so
//   Vercel can serve the XML directly off the edge cache without
//   re-running the file IO for `loadAllCollections()` on every crawl.

import { CATEGORIES } from "@/lib/constants";
import { loadAllCollections } from "@/lib/collections";
import { absoluteUrl } from "@/lib/seo";
import {
  renderUrlset,
  xmlResponse,
  type UrlEntry,
} from "@/lib/sitemap-xml";

export const revalidate = 3600;
export const dynamic = "force-static";

interface StaticHub {
  path: string;
  priority: number;
  changefreq: UrlEntry["changefreq"];
}

const STATIC_HUBS: StaticHub[] = [
  { path: "/", priority: 1.0, changefreq: "hourly" },
  { path: "/githubrepo", priority: 0.98, changefreq: "hourly" },
  { path: "/skills", priority: 0.95, changefreq: "hourly" },
  { path: "/mcp", priority: 0.95, changefreq: "hourly" },
  { path: "/top10", priority: 0.95, changefreq: "hourly" },
  { path: "/breakouts", priority: 0.9, changefreq: "hourly" },
  { path: "/funding", priority: 0.9, changefreq: "hourly" },
  { path: "/consensus", priority: 0.9, changefreq: "hourly" },
  { path: "/signals", priority: 0.85, changefreq: "hourly" },
  { path: "/twitter", priority: 0.85, changefreq: "hourly" },
  { path: "/agent-commerce", priority: 0.8, changefreq: "hourly" },
  { path: "/agent-repos", priority: 0.8, changefreq: "hourly" },
  { path: "/npm", priority: 0.8, changefreq: "hourly" },
  { path: "/research", priority: 0.8, changefreq: "daily" },
  { path: "/papers", priority: 0.8, changefreq: "daily" },
  { path: "/arxiv/trending", priority: 0.75, changefreq: "daily" },
  { path: "/huggingface", priority: 0.75, changefreq: "daily" },
  { path: "/huggingface/trending", priority: 0.8, changefreq: "daily" },
  { path: "/huggingface/datasets", priority: 0.75, changefreq: "daily" },
  { path: "/huggingface/spaces", priority: 0.75, changefreq: "daily" },
  { path: "/revenue", priority: 0.8, changefreq: "daily" },
  { path: "/categories", priority: 0.8, changefreq: "daily" },
  { path: "/collections", priority: 0.8, changefreq: "daily" },
  { path: "/hackernews/trending", priority: 0.8, changefreq: "hourly" },
  { path: "/bluesky/trending", priority: 0.75, changefreq: "daily" },
  { path: "/devto", priority: 0.75, changefreq: "daily" },
  { path: "/lobsters", priority: 0.75, changefreq: "daily" },
  { path: "/producthunt", priority: 0.75, changefreq: "daily" },
  { path: "/reddit", priority: 0.75, changefreq: "daily" },
  { path: "/reddit/trending", priority: 0.75, changefreq: "daily" },
  { path: "/digest", priority: 0.7, changefreq: "daily" },
  { path: "/ideas", priority: 0.7, changefreq: "daily" },
  { path: "/top", priority: 0.7, changefreq: "daily" },
  { path: "/trends", priority: 0.7, changefreq: "daily" },
  { path: "/tierlist", priority: 0.65, changefreq: "weekly" },
  { path: "/tools", priority: 0.6, changefreq: "weekly" },
  { path: "/tools/star-history", priority: 0.6, changefreq: "weekly" },
  { path: "/tools/treemap", priority: 0.6, changefreq: "weekly" },
  { path: "/tools/revenue-estimate", priority: 0.6, changefreq: "weekly" },
  { path: "/compare", priority: 0.5, changefreq: "weekly" },
  { path: "/methodology", priority: 0.5, changefreq: "weekly" },
  { path: "/docs", priority: 0.5, changefreq: "weekly" },
  { path: "/search", priority: 0.5, changefreq: "weekly" },
  { path: "/about", priority: 0.5, changefreq: "monthly" },
  { path: "/contact", priority: 0.45, changefreq: "monthly" },
  { path: "/submit", priority: 0.5, changefreq: "weekly" },
  { path: "/pricing", priority: 0.6, changefreq: "weekly" },
];

// Static hub paths that ship their own `opengraph-image.tsx`. Keyed by
// path for O(1) lookup as we build the entry list.
const HUBS_WITH_OG: Record<string, string> = {
  "/": "/opengraph-image",
  "/top10": "/api/og/top10?cat=repos&aspect=h",
  "/breakouts": "/breakouts/opengraph-image",
  "/compare": "/compare/opengraph-image",
};

export function GET(): Response {
  const now = new Date();
  const entries: UrlEntry[] = [];

  // 1. Static hub pages.
  for (const hub of STATIC_HUBS) {
    const entry: UrlEntry = {
      loc: absoluteUrl(hub.path),
      lastmod: now,
      changefreq: hub.changefreq,
      priority: hub.priority,
    };
    const ogPath = HUBS_WITH_OG[hub.path];
    if (ogPath) {
      entry.images = [{ loc: absoluteUrl(ogPath) }];
    }
    entries.push(entry);
  }

  // 2. Category landing pages — each ships a dynamic OG image.
  for (const c of CATEGORIES) {
    entries.push({
      loc: absoluteUrl(`/categories/${c.id}`),
      lastmod: now,
      changefreq: "daily",
      priority: 0.7,
      images: [
        {
          loc: absoluteUrl(`/categories/${c.id}/opengraph-image`),
          title: c.name,
          caption: c.description ?? c.shortName ?? c.name,
        },
      ],
    });
  }

  // 3. Curated collection pages — each ships a dynamic OG image.
  for (const c of loadAllCollections()) {
    entries.push({
      loc: absoluteUrl(`/collections/${c.slug}`),
      lastmod: now,
      changefreq: "weekly",
      priority: 0.7,
      images: [
        {
          loc: absoluteUrl(`/collections/${c.slug}/opengraph-image`),
          title: c.name,
        },
      ],
    });
  }

  const xml = renderUrlset(entries, ["image"]);
  return xmlResponse(xml, 3600);
}
