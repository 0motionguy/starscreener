// StarScreener — repo sub-sitemap (/sitemap-repos.xml)
//
// One of the leaves under the multi-sitemap index. Emits a `<urlset>`
// containing every tracked repo's detail page (`/repo/<owner>/<name>`),
// each enriched with an `<image:image>` block pointing at that repo's
// dynamic OG card.
//
// Why a 45_000 cap (not 50_000):
//   The sitemap protocol allows at most 50_000 URLs per file. We cap at
//   45_000 to keep ~10% headroom for: (a) future per-repo locale
//   variants, (b) accidental dupes that slip past the dedupe pass,
//   (c) any test fixtures that bloat the derived list during
//   incidents. Hitting 45k means it's time to shard, not panic.
//
// Why blended priority (priorityFromRepo):
//   Sitemap `<priority>` is a relative hint to crawlers — Google
//   ignores absolute values but uses them to rank URLs *within the
//   same site*. A pure-stars ranking would permanently pin
//   facebook/react and torvalds/linux at the top while a 50k-star
//   breakout repo sits at the bottom. Blending momentum (60%),
//   freshness (25%), and a star tier (15%) means the crawler is
//   nudged toward repos that are MOVING, which matches the product's
//   thesis (trend discovery), not toward repos that are merely
//   famous. See `priorityFromRepo` in src/lib/sitemap-xml.ts.
//
// Why archived/deleted are excluded:
//   `/repo/<owner>/<name>` for an archived repo renders the dead-repo
//   state (no charts, no signals); for a deleted upstream it 404s.
//   Either way, indexing is wasted budget — the cleanup pass that
//   sets `archived`/`deleted` runs hourly so this filter is fresh.
//   `isSitemapEligible` also rejects malformed slugs that would 404.
//
// Image extension purpose:
//   Each `<url>` carries the OG image at /repo/<o>/<n>/opengraph-image
//   inside `<image:image>`. This lets Google index repo cards in
//   Image Search ("vercel/next.js OG card") and is a small but
//   compounding traffic source on long-tail repo names. The OG image
//   is a server-rendered React component (1200x630), so the cost is
//   identical whether one or one-million crawlers fetch it.

import { pipeline } from "@/lib/pipeline/pipeline";
import { getDerivedRepos } from "@/lib/derived-repos";
import {
  renderUrlset,
  xmlResponse,
  priorityFromRepo,
  isSitemapEligible,
  repoUrl,
  repoOgImageUrl,
  type UrlEntry,
} from "@/lib/sitemap-xml";

export const revalidate = 3600;
export const dynamic = "force-static";

const MAX_URLS = 45000;

export async function GET(): Promise<Response> {
  await pipeline.ensureReady();

  const all = getDerivedRepos().filter(isSitemapEligible);

  // Sort: priority desc, momentum desc as tiebreaker.
  const sorted = all.slice().sort((a, b) => {
    const pa = priorityFromRepo(a);
    const pb = priorityFromRepo(b);
    if (pb !== pa) return pb - pa;
    const ma = a.momentumScore ?? 0;
    const mb = b.momentumScore ?? 0;
    return mb - ma;
  });

  // Dedupe by full URL. getDerivedRepos already dedupes by id, but
  // defense in depth — a duplicate <loc> in a sitemap is a hard
  // validator error in Search Console.
  const seen = new Set<string>();
  const entries: UrlEntry[] = [];
  for (const r of sorted) {
    if (entries.length >= MAX_URLS) break;
    const loc = repoUrl(r);
    if (seen.has(loc)) continue;
    seen.add(loc);

    const caption = (r.description?.slice(0, 160) || r.fullName).trim();

    entries.push({
      loc,
      lastmod: r.lastCommitAt ?? r.lastReleaseAt ?? r.createdAt ?? new Date(),
      changefreq: "daily",
      priority: priorityFromRepo(r),
      images: [
        {
          loc: repoOgImageUrl(r),
          title: r.fullName,
          caption,
        },
      ],
    });
  }

  const xml = renderUrlset(entries, ["image"]);
  return xmlResponse(xml, 3600);
}
