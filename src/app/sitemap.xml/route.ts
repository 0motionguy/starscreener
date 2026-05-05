// TrendingRepo — sitemap index (top of the multi-sitemap tree).
//
// References six sub-sitemaps:
//   /sitemap-pages.xml    — static hubs + categories + collections
//   /sitemap-repos.xml    — every tracked repo (image-extension, archived filter)
//   /sitemap-news.xml     — Google News protocol over the live HN/PH feeds
//   /sitemap-digest.xml   — /digest hub + every dated daily-trending snapshot URL
//   /sitemap-profiles.xml — public /u/* profiles with activity-based lastmod
//   /brief/sitemap.xml    — curated repo brief pages
//
// AGN-919 / QUE-16 fix: per-child `<lastmod>` now reflects the max
// `<lastmod>` across the URLs in that child sitemap (computed by
// `lib/sitemap-lastmod.ts`), not `now()`. This makes the index a
// faithful "what changed" signal so crawlers skip unchanged children.
//
// Failure mode: if a child's data source is unreachable we OMIT the
// lastmod for that entry rather than emitting a wrong one. An entry
// without `<lastmod>` is valid sitemap XML and crawlers fall back to
// HTTP-level cache validators.
//
// Cache: revalidate hourly via the route handler's cache-control header
// (handled by xmlResponse). Vercel edge cache + crawler-side cache
// absorb the bursts at indexing time.

import { absoluteUrl } from "@/lib/seo";
import {
  renderSitemapIndex,
  xmlResponse,
} from "@/lib/sitemap-xml";
import {
  getBriefLastmod,
  getDigestLastmod,
  getNewsLastmod,
  getPagesLastmod,
  getProfilesLastmod,
  getReposLastmod,
} from "@/lib/sitemap-lastmod";

export const revalidate = 3600;
export const dynamic = "force-static";

export async function GET(): Promise<Response> {
  const settled = await Promise.allSettled([
    Promise.resolve(getPagesLastmod()),
    getReposLastmod(),
    Promise.resolve(getNewsLastmod()),
    getDigestLastmod(),
    getProfilesLastmod(),
    Promise.resolve(getBriefLastmod()),
  ]);

  const [pages, repos, news, digest, profiles, brief] = settled.map((r) =>
    r.status === "fulfilled" ? r.value : undefined,
  );

  const entry = (loc: string, lastmod: Date | undefined) =>
    lastmod ? { loc, lastmod } : { loc };

  const xml = renderSitemapIndex([
    entry(absoluteUrl("/sitemap-pages.xml"), pages),
    entry(absoluteUrl("/sitemap-repos.xml"), repos),
    entry(absoluteUrl("/sitemap-news.xml"), news),
    entry(absoluteUrl("/sitemap-digest.xml"), digest),
    entry(absoluteUrl("/sitemap-profiles.xml"), profiles),
    entry(absoluteUrl("/brief/sitemap.xml"), brief),
  ]);
  return xmlResponse(xml, 3600);
}
