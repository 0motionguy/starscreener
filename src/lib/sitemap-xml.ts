// TrendingRepo — sitemap XML helpers
//
// Hand-rolled XML builder for the multi-sitemap surface (sitemap index,
// pages, repos, news). The Next.js `MetadataRoute.Sitemap` type cannot
// emit the `<image:image>` or `<news:news>` extensions, and a sitemap
// index is a different document type entirely — so we serve every
// sitemap through `app/<name>/route.ts` route handlers and use these
// helpers to produce spec-compliant XML.
//
// Refs:
//   - https://www.sitemaps.org/protocol.html
//   - https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps
//   - https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap
//
// Every public helper escapes its inputs at the boundary, so callers
// can pass repo names / URLs / titles without thinking about XSS or
// XML injection.

import type { Repo } from "./types";
import { absoluteUrl } from "./seo";

/** Escape the five XML predefined entities. Apply to every interpolated string. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Coerce a Date | string | number | null/undefined to a W3C ISO 8601 datetime. */
export function w3cDate(input: Date | string | number | null | undefined): string {
  const d = input instanceof Date ? input : new Date(input ?? Date.now());
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export type ChangeFreq =
  | "always"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "never";

export interface ImageEntry {
  /** Image URL — must be on a host the crawler can fetch. */
  loc: string;
  caption?: string;
  title?: string;
}

export interface NewsEntry {
  publicationName: string;
  publicationLanguage: string;
  publicationDate: Date | string;
  title: string;
}

export interface UrlEntry {
  loc: string;
  lastmod?: Date | string | number;
  changefreq?: ChangeFreq;
  /** 0.0 – 1.0. Caller is responsible for clamping; we just format. */
  priority?: number;
  images?: ImageEntry[];
  news?: NewsEntry;
}

function imageBlock(img: ImageEntry): string {
  const lines = [
    "    <image:image>",
    `      <image:loc>${escapeXml(img.loc)}</image:loc>`,
  ];
  if (img.caption) lines.push(`      <image:caption>${escapeXml(img.caption)}</image:caption>`);
  if (img.title) lines.push(`      <image:title>${escapeXml(img.title)}</image:title>`);
  lines.push("    </image:image>");
  return lines.join("\n");
}

function newsBlock(news: NewsEntry): string {
  return [
    "    <news:news>",
    "      <news:publication>",
    `        <news:name>${escapeXml(news.publicationName)}</news:name>`,
    `        <news:language>${escapeXml(news.publicationLanguage)}</news:language>`,
    "      </news:publication>",
    `      <news:publication_date>${escapeXml(w3cDate(news.publicationDate))}</news:publication_date>`,
    `      <news:title>${escapeXml(news.title)}</news:title>`,
    "    </news:news>",
  ].join("\n");
}

/** Render a single `<url>` element. Image + news extensions emitted only if present. */
export function renderUrlEntry(entry: UrlEntry): string {
  const parts = [
    "  <url>",
    `    <loc>${escapeXml(entry.loc)}</loc>`,
  ];
  if (entry.lastmod !== undefined) {
    parts.push(`    <lastmod>${escapeXml(w3cDate(entry.lastmod))}</lastmod>`);
  }
  if (entry.changefreq) {
    parts.push(`    <changefreq>${entry.changefreq}</changefreq>`);
  }
  if (entry.priority !== undefined) {
    parts.push(`    <priority>${entry.priority.toFixed(2)}</priority>`);
  }
  if (entry.news) parts.push(newsBlock(entry.news));
  if (entry.images && entry.images.length) {
    for (const img of entry.images) parts.push(imageBlock(img));
  }
  parts.push("  </url>");
  return parts.join("\n");
}

export type UrlsetExtension = "image" | "news";

const NS = {
  urlset: "http://www.sitemaps.org/schemas/sitemap/0.9",
  image: "http://www.google.com/schemas/sitemap-image/1.1",
  news: "http://www.google.com/schemas/sitemap-news/0.9",
} as const;

/** Build a complete `<urlset>` document with optional extension namespaces. */
export function renderUrlset(
  entries: UrlEntry[],
  extensions: UrlsetExtension[] = [],
): string {
  const ns = [`xmlns="${NS.urlset}"`];
  if (extensions.includes("image")) ns.push(`xmlns:image="${NS.image}"`);
  if (extensions.includes("news")) ns.push(`xmlns:news="${NS.news}"`);
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset ${ns.join(" ")}>`,
    ...entries.map(renderUrlEntry),
    `</urlset>`,
  ].join("\n");
}

export interface SitemapIndexEntry {
  loc: string;
  lastmod?: Date | string | number;
}

/** Build a sitemap index document referencing N sub-sitemaps. */
export function renderSitemapIndex(entries: SitemapIndexEntry[]): string {
  const items = entries.map((e) => {
    const parts = [
      "  <sitemap>",
      `    <loc>${escapeXml(e.loc)}</loc>`,
    ];
    if (e.lastmod !== undefined) {
      parts.push(`    <lastmod>${escapeXml(w3cDate(e.lastmod))}</lastmod>`);
    }
    parts.push("  </sitemap>");
    return parts.join("\n");
  });
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<sitemapindex xmlns="${NS.urlset}">`,
    ...items,
    `</sitemapindex>`,
  ].join("\n");
}

/** Standard XML response wrapper for Next route handlers. */
export function xmlResponse(body: string, cacheSeconds: number = 3600): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 2}`,
    },
  });
}

/**
 * Compute a sitemap priority for a repo by blending momentum (0-100),
 * freshness (days since last commit), and a star-count tier. Output is
 * clamped to [0.30, 0.95]. The 0.30 floor keeps every tracked repo
 * above the static-page priority of leaf utility routes; the 0.95 cap
 * leaves room for the homepage at 1.0.
 */
export function priorityFromRepo(repo: Repo): number {
  const momentum = Math.max(0, Math.min(100, repo.momentumScore ?? 0));
  // freshness: 0 days = 1.0, 30+ days = 0.0, linear.
  const lastCommitMs = repo.lastCommitAt ? new Date(repo.lastCommitAt).getTime() : 0;
  const daysSince = lastCommitMs ? (Date.now() - lastCommitMs) / (1000 * 60 * 60 * 24) : 30;
  const freshness = Math.max(0, Math.min(1, 1 - daysSince / 30));
  // star tier: log10(stars) / 6 capped at 1 (1M+ stars saturates).
  const stars = repo.stars ?? 0;
  const starTier = stars > 0 ? Math.min(1, Math.log10(stars + 1) / 6) : 0;
  // weights: momentum 60% / freshness 25% / stars 15%.
  const blended = 0.6 * (momentum / 100) + 0.25 * freshness + 0.15 * starTier;
  // map [0,1] -> [0.30, 0.95].
  return Number((0.3 + blended * 0.65).toFixed(2));
}

/** Filter repos that should NEVER appear in a public sitemap. */
export function isSitemapEligible(repo: Repo): boolean {
  if (repo.archived) return false;
  if (repo.deleted) return false;
  if (!repo.owner || !repo.name) return false;
  // Slug shape paranoia — `/^[A-Za-z0-9._-]+$/` is what /repo/[o]/[n] expects.
  const slugSafe = /^[A-Za-z0-9._-]+$/;
  if (!slugSafe.test(repo.owner) || !slugSafe.test(repo.name)) return false;
  return true;
}

/** Convenience: produce the absolute URL of a repo detail page. */
export function repoUrl(repo: Pick<Repo, "owner" | "name">): string {
  return absoluteUrl(`/repo/${repo.owner}/${repo.name}`);
}

/** Convenience: produce the absolute URL of a repo's OG image. */
export function repoOgImageUrl(repo: Pick<Repo, "owner" | "name">): string {
  return absoluteUrl(`/repo/${repo.owner}/${repo.name}/opengraph-image`);
}
