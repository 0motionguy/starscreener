// /hackernews/trending — velocity-scored HN story feed.
//
// Single-tab v1: top 50 stories from data/hackernews-trending.json
// (Firebase top-500 + Algolia 7d github-mention sweep, deduped, scored
// by velocity * log10(score)). Mirrors the structural/visual rhythm of
// /reddit/trending: header strip, 4 stat tiles, list below. No topic
// mindshare map (HN has no n-gram topics yet).

import {
  getHnTopStories,
  getHnTrendingFile,
  refreshHackernewsTrendingFromStore,
} from "@/lib/hackernews-trending";
import {
  hnItemHref,
  refreshHackernewsMentionsFromStore,
  repoFullNameToHref,
} from "@/lib/hackernews";
import { NewsTopHeaderV3 } from "@/components/news/NewsTopHeaderV3";
import { buildHackerNewsHeader } from "@/components/news/newsTopMetrics";

const HN_ACCENT = "rgba(245, 110, 15, 0.85)";

export const dynamic = "force-static";

const HN_ORANGE = "#ff6600";

function formatAgeHours(ageHours: number | undefined): string {
  if (ageHours === undefined || !Number.isFinite(ageHours)) return "—";
  if (ageHours < 1) return "<1h";
  if (ageHours < 24) return `${Math.round(ageHours)}h`;
  return `${Math.round(ageHours / 24)}d`;
}

export default async function HackerNewsTrendingPage() {
  await Promise.all([
    refreshHackernewsTrendingFromStore(),
    refreshHackernewsMentionsFromStore(),
  ]);
  const trendingFile = getHnTrendingFile();
  const stories = getHnTopStories(50);
  const allStories = trendingFile.stories;
  const cold = allStories.length === 0;

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* V3 page header — mono eyebrow + title + tight subtitle. */}
        <header
          className="mb-5 pb-4 border-b"
          style={{ borderColor: "var(--v3-line-100)" }}
        >
          <div
            className="v2-mono mb-2 text-[10px] tracking-[0.18em] uppercase"
            style={{ color: "var(--v3-ink-400)" }}
          >
            {"// FIREBASE TOP 500 · ALGOLIA 7D · GITHUB MENTIONS"}
          </div>
          <h1
            className="text-2xl font-bold uppercase tracking-wider"
            style={{ color: "var(--v3-ink-000)" }}
          >
            HACKERNEWS / ALL TRENDING
          </h1>
          <p
            className="mt-2 text-[13px] leading-relaxed max-w-2xl"
            style={{ color: "var(--v3-ink-300)" }}
          >
            Every Hacker News story from the dual-source scrape: Firebase top
            500 (front page + new) merged with Algolia&apos;s 7d sweep for
            github-linked submissions. Stories are ranked by{" "}
            <code style={{ color: "var(--v3-ink-100)" }}>trendingScore</code> —
            velocity (points/hour) weighted by log10(score) so a 200-pt rocket
            outranks a 1500-pt 3-day-old whale.
          </p>
        </header>

        {cold ? (
          <ColdState />
        ) : (
          <>
            {/* V3 top header — 3 chart cards + 3 hero stories. The legacy
                4-tile stat row that used to live below this is dropped: the
                snapshot card + activity bars cover every metric it carried. */}
            <div className="mb-6">
              <NewsTopHeaderV3
                eyebrow="// HACKERNEWS · TOP STORIES"
                status={`${allStories.length.toLocaleString("en-US")} TRACKED · ${trendingFile.windowHours}H`}
                {...buildHackerNewsHeader(trendingFile, getHnTopStories(3))}
                accent={HN_ACCENT}
              />
            </div>

            {/* Feed */}
            <section className="border border-border-primary rounded-md bg-bg-secondary overflow-hidden">
              <div className="grid grid-cols-[40px_1fr_auto_60px_60px_80px] gap-3 items-center px-3 h-9 border-b border-border-primary text-[10px] uppercase tracking-wider text-text-tertiary">
                <div>#</div>
                <div>TITLE</div>
                <div>FP</div>
                <div className="text-right">SCORE</div>
                <div className="text-right">CMTS</div>
                <div className="text-right">AGE</div>
              </div>
              <ul>
                {stories.map((s, i) => {
                  const linkedRepo = s.linkedRepos?.[0]?.fullName;
                  const scoreClass =
                    s.score >= 100 ? "" : "text-text-secondary";
                  return (
                    <li
                      key={s.id}
                      className="grid grid-cols-[40px_1fr_auto_60px_60px_80px] gap-3 items-center px-3 h-10 hover:bg-bg-card-hover border-b border-border-primary/40 last:border-b-0"
                    >
                      <div className="text-text-tertiary text-xs tabular-nums">
                        {i + 1}
                      </div>
                      <div className="min-w-0 flex items-center gap-2">
                        <a
                          href={hnItemHref(s.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-text-primary hover:text-accent-green truncate"
                          title={s.title}
                        >
                          {s.title}
                        </a>
                        {linkedRepo ? (
                          <a
                            href={repoFullNameToHref(linkedRepo)}
                            className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-border-primary text-text-tertiary hover:text-accent-green hover:border-accent-green/50 transition-colors"
                            title={`Linked repo: ${linkedRepo}`}
                          >
                            {linkedRepo}
                          </a>
                        ) : null}
                      </div>
                      <div>
                        {s.everHitFrontPage ? (
                          <span
                            className="inline-flex items-center justify-center text-[8px] font-bold w-3.5 h-3.5 rounded-sm text-white"
                            style={{ backgroundColor: HN_ORANGE }}
                            title="Hit the HN front page"
                          >
                            Y
                          </span>
                        ) : (
                          <span className="text-text-tertiary text-[10px]">
                            —
                          </span>
                        )}
                      </div>
                      <div
                        className={`text-right text-xs tabular-nums ${scoreClass}`}
                        style={
                          s.score >= 100 ? { color: HN_ORANGE } : undefined
                        }
                      >
                        {s.score.toLocaleString("en-US")}
                      </div>
                      <div className="text-right text-xs tabular-nums text-text-secondary">
                        {s.descendants.toLocaleString("en-US")}
                      </div>
                      <div className="text-right text-xs tabular-nums text-text-tertiary">
                        {formatAgeHours(s.ageHours)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function ColdState() {
  return (
    <section className="border border-dashed border-border-primary rounded-md p-8 bg-bg-secondary/40">
      <h2 className="text-lg font-bold uppercase tracking-wider text-accent-green">
        {"// no data yet"}
      </h2>
      <p className="mt-3 text-sm text-text-secondary max-w-xl">
        The Hacker News scraper hasn&apos;t run yet. Run{" "}
        <code className="text-text-primary">npm run scrape:hn</code> locally to
        populate{" "}
        <code className="text-text-primary">
          data/hackernews-trending.json
        </code>
        , then refresh this page.
      </p>
    </section>
  );
}
