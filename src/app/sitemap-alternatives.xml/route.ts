// TrendingRepo — alternatives sub-sitemap.
//
// Advertises /alternatives/<repo> ONLY for repos that (a) carry a consensus
// verdict and (b) sit in a category with enough peers to fill the page —
// the same conservative high-signal gate the page enforces, so the sitemap
// never lists a URL that would 404 or render thin. The page still 200s
// on-demand for any qualifying repo.

import { refreshTrendingFromStore } from "@/lib/trending";
import { refreshRepoRegistryFromStore } from "@/lib/derived-repos/loaders/registry";
import { refreshConsensusVerdictsFromStore, getConsensusItemReport } from "@/lib/consensus-verdicts";
import { getDerivedRepos } from "@/lib/derived-repos";
import { MIN_ALTERNATIVES } from "@/lib/alternatives";
import { absoluteUrl } from "@/lib/seo";
import { renderUrlset, xmlResponse, type UrlEntry } from "@/lib/sitemap-xml";

export const revalidate = 3600;

const MAX = 800;

export async function GET(): Promise<Response> {
  await Promise.all([
    refreshTrendingFromStore().catch(() => undefined),
    refreshRepoRegistryFromStore().catch(() => undefined),
    refreshConsensusVerdictsFromStore().catch(() => undefined),
  ]);

  const now = new Date();
  const entries: UrlEntry[] = [];
  try {
    const repos = getDerivedRepos();
    const catCount = new Map<string, number>();
    for (const r of repos) catCount.set(r.categoryId, (catCount.get(r.categoryId) ?? 0) + 1);

    for (const r of repos) {
      if (entries.length >= MAX) break;
      // need >= MIN_ALTERNATIVES peers besides the target itself
      if ((catCount.get(r.categoryId) ?? 0) < MIN_ALTERNATIVES + 1) continue;
      const v = getConsensusItemReport(r.fullName);
      if (!v || !v.summary.trim()) continue;
      entries.push({
        loc: absoluteUrl(`/alternatives/${r.owner}/${r.name}`),
        lastmod: now,
        changefreq: "weekly",
        priority: 0.6,
      });
    }
  } catch {
    /* empty sitemap on cold cache is fine */
  }

  return xmlResponse(renderUrlset(entries), 3600);
}
