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

// 3-tier sitemap to recover from the 1,256 "Discovered, not indexed" GSC
// state. Previously: all 839 repos shipped at flat changefreq=daily, which
// flooded Google's crawl budget. Google capped the budget and rejected
// most. Now we tell Google exactly which URLs deserve daily attention,
// which are weekly, and EXCLUDE the long-tail entirely (Google can still
// discover them via internal links if they matter; the sitemap shouldn't
// promise more than the site's domain authority can deliver).
//
// Tier A: top 100-200 repos by cross-signal score. priority 0.9, daily.
// Tier B: rank ≤400 OR crossSignalScore ≥1.0. priority 0.5, weekly.
// Tier C: everything else. EXCLUDED from sitemap.
//
// Hard cap MAX_URLS=600 keeps the file under Google's preferred budget
// and frees the rest of the 50k protocol limit for future locale variants.
const MAX_URLS = 600;

type Tier = "A" | "B" | "C";

function classifyTier(r: ReturnType<typeof getDerivedRepos>[number]): Tier {
  const cross = r.crossSignalScore ?? 0;
  const rank = r.rank ?? Number.POSITIVE_INFINITY;
  if (cross >= 2.5 || rank <= 100) return "A";
  if (cross >= 1.0 || rank <= 400) return "B";
  return "C";
}

const TIER_PRIORITY: Record<Tier, number> = { A: 0.9, B: 0.5, C: 0.1 };
const TIER_FREQ: Record<Tier, "daily" | "weekly" | "monthly"> = {
  A: "daily",
  B: "weekly",
  C: "monthly",
};

export async function GET(): Promise<Response> {
  await pipeline.ensureReady();

  const all = getDerivedRepos().filter(isSitemapEligible);

  // Classify, then drop Tier C entirely.
  const tiered = all
    .map((r) => ({ repo: r, tier: classifyTier(r) }))
    .filter((t) => t.tier !== "C");

  // Sort: Tier A before B; within tier, momentum desc.
  tiered.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === "A" ? -1 : 1;
    const ma = a.repo.momentumScore ?? 0;
    const mb = b.repo.momentumScore ?? 0;
    return mb - ma;
  });

  // Dedupe by full URL.
  const seen = new Set<string>();
  const entries: UrlEntry[] = [];
  for (const { repo: r, tier } of tiered) {
    if (entries.length >= MAX_URLS) break;
    const loc = repoUrl(r);
    if (seen.has(loc)) continue;
    seen.add(loc);

    const caption = (r.description?.slice(0, 160) || r.fullName).trim();

    entries.push({
      loc,
      lastmod: r.lastCommitAt ?? r.lastReleaseAt ?? r.createdAt ?? new Date(),
      changefreq: TIER_FREQ[tier],
      priority: TIER_PRIORITY[tier],
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
