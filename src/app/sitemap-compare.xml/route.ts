// TrendingRepo — comparison sub-sitemap.
//
// Advertises ONLY the curated, high-signal "X vs Y" pairs (in-category, both
// repos carry a consensus verdict) — not the combinatorial universe of all
// possible pairs. This is the conservative gate that keeps Google from
// indexing thin auto-generated comparisons while still surfacing the
// genuinely useful ones. The page itself 200s for any valid pair on demand.

import { refreshTrendingFromStore } from "@/lib/trending";
import { refreshRepoRegistryFromStore } from "@/lib/derived-repos/loaders/registry";
import { refreshConsensusVerdictsFromStore } from "@/lib/consensus-verdicts";
import { selectComparablePairs, comparePath } from "@/lib/compare-pairs";
import { absoluteUrl } from "@/lib/seo";
import { renderUrlset, xmlResponse, type UrlEntry } from "@/lib/sitemap-xml";

export const revalidate = 3600;

const MAX_PAIRS = 800;

export async function GET(): Promise<Response> {
  await Promise.all([
    refreshTrendingFromStore().catch(() => undefined),
    refreshRepoRegistryFromStore().catch(() => undefined),
    refreshConsensusVerdictsFromStore().catch(() => undefined),
  ]);

  const now = new Date();
  const pairs = (() => {
    try {
      return selectComparablePairs(5).slice(0, MAX_PAIRS);
    } catch {
      return [];
    }
  })();

  const entries: UrlEntry[] = pairs.map((p) => ({
    loc: absoluteUrl(comparePath(p.a, p.b)),
    lastmod: now,
    changefreq: "weekly",
    priority: 0.6,
  }));

  return xmlResponse(renderUrlset(entries), 3600);
}
