// TrendingRepo — Today (homepage `/`).
//
// V2 design system. Renders the 5-stage product loop:
//   Discover ideas + repos → Validate market signal → Check ecosystem
//   traction → Prepare for launch → Track funding/revenue outcomes.
//
// Server component. Reads the derived Repo[] from committed JSON
// (data/trending.json + data/deltas.json) and the ranked ideas feed
// from .data/ideas.jsonl + reactions store. Hands both to the V2 hero
// + activity strip + ideas/repos split + trending table + signal radar
// + launch section.
//
// Title/description metadata is inherited from the root layout template
// — the canonical "TrendingRepo — {tagline}" formula stays single-source
// in src/lib/seo.ts.

import { getDerivedRepos } from "@/lib/derived-repos";
import { lastFetchedAt } from "@/lib/trending";
import { loadHotIdeasForToday } from "@/lib/today-ideas";
import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo";

import { HeroV2 } from "@/components/today-v2/HeroV2";
import { ActivityStripV2 } from "@/components/today-v2/ActivityStripV2";
import { TabsV2 } from "@/components/today-v2/TabsV2";
import { IdeasRepoSplitV2 } from "@/components/today-v2/IdeasRepoSplitV2";
import { TrendingTableV2 } from "@/components/today-v2/TrendingTableV2";
import { SignalRadarV2 } from "@/components/today-v2/SignalRadarV2";
import { LaunchSectionV2 } from "@/components/today-v2/LaunchSectionV2";
import { AsciiInterstitial } from "@/components/today-v2/AsciiInterstitial";

// ISR: data/*.json only changes when the GHA scrape commits new
// trending data, so serving the homepage from a 30-minute edge cache
// is safe.
export const revalidate = 1800;

export default async function HomePage() {
  const repos = getDerivedRepos();

  // Top-trending repos for the hero (right column) — ranked by 24h
  // star delta to surface what's actually moving today.
  const heroRepos = [...repos]
    .sort((a, b) => b.starsDelta24h - a.starsDelta24h)
    .slice(0, 4);

  // Top ideas for the hero. Returns at most 4 by hot score.
  const heroIdeas = await loadHotIdeasForToday(4);

  // Top-20 repos for the ItemList JSON-LD below — canonical list of
  // what's "on this page" for search crawlers.
  const itemListTop = [...repos]
    .sort((a, b) => b.starsDelta24h - a.starsDelta24h)
    .slice(0, 20);

  if (repos.length === 0) {
    return (
      <>
        <HeroV2 repos={[]} lastFetchedAt={lastFetchedAt} />
        <section className="border-b border-[color:var(--v2-line-100)]">
          <div className="v2-frame py-12 text-center">
            <p className="v2-mono">
              <span aria-hidden>{"// "}</span>
              NO DATA · COLD START · WAITING NEXT SCRAPE
            </p>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <HeroV2 repos={repos} lastFetchedAt={lastFetchedAt} />

      <ActivityStripV2 repos={repos} ideas={heroIdeas} />

      <TabsV2 />

      <IdeasRepoSplitV2 ideas={heroIdeas} repos={heroRepos} limit={4} />

      <TrendingTableV2 repos={repos} limit={20} />

      <SignalRadarV2 repos={repos} limit={220} />

      <AsciiInterstitial />

      <LaunchSectionV2 repos={repos} limit={6} />

      {/* Footer sign-off — V2 closing line. */}
      <footer className="py-8">
        <div className="v2-frame flex items-center justify-between v2-mono">
          <span>
            <span aria-hidden>{"// "}</span>
            TRENDINGREPO ·{" "}
            <span className="tabular-nums">
              {String(repos.length).padStart(3, "0")}/2200
            </span>{" "}
            REPOS LIVE
          </span>
          <span className="text-[color:var(--v2-ink-400)]">
            END OF PAGE ▮
          </span>
        </div>
      </footer>

      {/* CollectionPage + ItemList JSON-LD — tells crawlers this page
          is a curated list of trending repos and enumerates the top 20
          so structured-data rich results can pick them up. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "@id": `${SITE_URL.replace(/\/+$/, "")}/#homepage`,
            name: `${SITE_NAME} — today's trending ideas, repos, and signals`,
            url: absoluteUrl("/"),
            isPartOf: {
              "@type": "WebSite",
              name: SITE_NAME,
              url: SITE_URL,
            },
            dateModified: lastFetchedAt,
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: itemListTop.length,
              itemListOrder: "https://schema.org/ItemListOrderDescending",
              itemListElement: itemListTop.map((r, i) => ({
                "@type": "ListItem",
                position: i + 1,
                url: absoluteUrl(`/repo/${r.owner}/${r.name}`),
                name: r.fullName,
              })),
            },
          }),
        }}
      />
    </>
  );
}
