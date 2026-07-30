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
import { BEST_TOPICS } from "@/lib/best-topics";
import { GLOSSARY } from "@/lib/glossary";
import { getAllPostsMeta } from "@/lib/blog";
import { loadAllCollections } from "@/lib/collections";
import { absoluteUrl } from "@/lib/seo";
import {
  renderUrlset,
  xmlResponse,
  type UrlEntry,
} from "@/lib/sitemap-xml";
import { COMPETITORS } from "@/lib/vs/competitors";

export const revalidate = 3600;
export const dynamic = "force-static";

interface StaticHub {
  path: string;
  priority: number;
  changefreq: UrlEntry["changefreq"];
}

// Only canonical 200-returning hubs belong here. The v6 cutover retired ~30
// legacy paths (/githubrepo, /skills, /mcp, /top10, /breakouts, /consensus,
// /signals, /twitter, /agent-repos, /npm, /research, /papers, /arxiv/*,
// /huggingface/*, /hackernews/*, /bluesky/*, /devto, /lobsters, /producthunt,
// /reddit/*, /digest, /top, /trends, /tierlist, /compare, /docs, /search,
// /submit) — they 308/307 via next.config. Redirects in a sitemap waste crawl
// budget and erode trust, so they were removed (2026-05-28). Where a legacy
// alias redirected to a real v6 page, the canonical target is listed instead
// (/breakout, /market-signals, /drop). Verify with: curl -sI the path → 200.
const STATIC_HUBS: StaticHub[] = [
  { path: "/", priority: 1.0, changefreq: "hourly" },
  { path: "/breakout", priority: 0.9, changefreq: "hourly" },
  { path: "/market-signals", priority: 0.85, changefreq: "hourly" },
  { path: "/funding", priority: 0.9, changefreq: "hourly" },
  { path: "/revenue", priority: 0.8, changefreq: "daily" },
  { path: "/categories", priority: 0.8, changefreq: "daily" },
  { path: "/best", priority: 0.85, changefreq: "daily" },
  { path: "/blog", priority: 0.8, changefreq: "daily" },
  { path: "/glossary", priority: 0.75, changefreq: "weekly" },
  { path: "/collections", priority: 0.8, changefreq: "daily" },
  { path: "/ideas", priority: 0.7, changefreq: "daily" },
  { path: "/drop", priority: 0.6, changefreq: "weekly" },
  { path: "/tools", priority: 0.6, changefreq: "weekly" },
  { path: "/tools/star-history", priority: 0.6, changefreq: "weekly" },
  { path: "/tools/treemap", priority: 0.6, changefreq: "weekly" },
  { path: "/tools/revenue-estimate", priority: 0.6, changefreq: "weekly" },
  { path: "/tools/tier-list", priority: 0.6, changefreq: "weekly" },
  { path: "/tools/top-10", priority: 0.65, changefreq: "daily" },
  { path: "/tools/digest", priority: 0.6, changefreq: "daily" },
  { path: "/tools/compare", priority: 0.6, changefreq: "weekly" },
  { path: "/tools/watchlist", priority: 0.5, changefreq: "weekly" },
  { path: "/methodology", priority: 0.5, changefreq: "weekly" },
  { path: "/about", priority: 0.5, changefreq: "monthly" },
  { path: "/contact", priority: 0.45, changefreq: "monthly" },
  { path: "/pricing", priority: 0.6, changefreq: "weekly" },
  { path: "/vs", priority: 0.6, changefreq: "weekly" },
];

// Static hub paths that ship their own `opengraph-image.tsx`. Keyed by
// path for O(1) lookup as we build the entry list.
const HUBS_WITH_OG: Record<string, string> = {
  // /top10, /breakouts, /compare removed from STATIC_HUBS (they redirect), so
  // their OG entries are dropped too. Homepage points at the real /api/og/default.
  "/": "/api/og/default",
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

  // 3. "Best of" listicle pages — each ships a dynamic OG image.
  for (const t of BEST_TOPICS) {
    entries.push({
      loc: absoluteUrl(`/best/${t.slug}`),
      lastmod: now,
      changefreq: "daily",
      priority: 0.75,
      images: [
        {
          loc: absoluteUrl(`/best/${t.slug}/opengraph-image`),
          title: t.title,
          caption: t.blurb,
        },
      ],
    });
  }

  // 3a2. Glossary terms — definitional pages, each with a dynamic OG image.
  for (const t of GLOSSARY) {
    entries.push({
      loc: absoluteUrl(`/glossary/${t.slug}`),
      lastmod: now,
      changefreq: "monthly",
      priority: 0.7,
      images: [{ loc: absoluteUrl(`/glossary/${t.slug}/opengraph-image`), title: `What is ${t.term}?` }],
    });
  }

  // 3b. Blog posts (MDX). Evergreen articles; lastmod from frontmatter.
  for (const post of getAllPostsMeta()) {
    entries.push({
      loc: absoluteUrl(`/blog/${post.slug}`),
      lastmod: new Date(post.updated ?? post.date),
      changefreq: "monthly",
      priority: 0.7,
    });
  }

  // 4. Curated collection pages — each ships a dynamic OG image.
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

  // 4. /vs/<competitor> comparison pages. Each is hand-authored from a v3
  //    competitor-deep-crawl run and refreshes weekly — same cadence as the
  //    /vs index above.
  for (const c of COMPETITORS) {
    entries.push({
      loc: absoluteUrl(`/vs/${c.slug}`),
      lastmod: now,
      changefreq: "weekly",
      priority: 0.55,
    });
  }

  const xml = renderUrlset(entries, ["image"]);
  return xmlResponse(xml, 3600);
}
