// /news — HackerNews tab body (extracted from page.tsx, APP-05).
// Server component; consumes already-resolved data passed from page.tsx.

import {
  getHnTopStories,
  getHnTrendingFile,
  refreshHackernewsTrendingFromStore,
} from "@/lib/hackernews-trending";
import {
  getHnLeaderboard,
  hnItemHref,
  refreshHackernewsMentionsFromStore,
  type HnStory,
} from "@/lib/hackernews";
import {
  HN_ORANGE,
  ColdCard,
  FullViewLink,
  ListShell,
  StatTile,
  formatAgeHours,
  formatRelative,
} from "../_shared";

export function HackerNewsTabBody({ stories }: { stories: HnStory[] }) {
  const trendingFile = getHnTrendingFile();
  const allStories = trendingFile.stories;
  const frontPageCount = allStories.filter((s) => s.everHitFrontPage).length;
  const reposLinked = getHnLeaderboard().length;
  const cold = allStories.length === 0;

  if (cold) {
    return (
      <ColdCard
        title="// hackernews cold"
        body={
          <>
            The Hacker News scraper hasn&apos;t run yet. Run{" "}
            <code className="text-text-primary">npm run scrape:hn</code>{" "}
            locally to populate{" "}
            <code className="text-text-primary">
              data/hackernews-trending.json
            </code>
            , then refresh.
          </>
        }
      />
    );
  }

  return (
    <>
      <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          label="LAST SCRAPE"
          value={formatRelative(trendingFile.fetchedAt)}
          hint="hackernews"
        />
        <StatTile
          label="STORIES TRACKED"
          value={allStories.length.toLocaleString("en-US")}
          hint={`${trendingFile.windowHours}h window`}
        />
        <StatTile
          label="FRONT PAGE"
          value={frontPageCount.toLocaleString("en-US")}
          hint="ever hit top 30"
        />
        <StatTile
          label="REPOS LINKED"
          value={reposLinked.toLocaleString("en-US")}
          hint="github mentions 7d"
        />
      </section>

      <ListShell>
        <div className="hidden sm:grid grid-cols-[40px_1fr_60px_60px_60px_80px] gap-3 items-center px-3 h-9 border-b text-[10px] uppercase tracking-wider"
          style={{ borderColor: "var(--v2-line-100)", color: "var(--v2-ink-400)" }}
        >
          <div>#</div>
          <div>TITLE</div>
          <div className="text-right">FP</div>
          <div className="text-right">SCORE</div>
          <div className="text-right">CMTS</div>
          <div className="text-right">AGE</div>
        </div>
        <ul className="divide-y" style={{ borderColor: "var(--v2-line-100)" }}>
          {stories.map((s, i) => {
            const isHigh = s.score >= 100;
            return (
              <li
                key={s.id}
                className="grid grid-cols-[28px_1fr_auto] sm:grid-cols-[40px_1fr_60px_60px_60px_80px] gap-3 items-center px-3 min-h-[44px] sm:h-10 py-2 sm:py-0 hover:bg-bg-card-hover transition-colors"
              >
                <div style={{ color: "var(--v2-ink-400)" }} className="text-xs tabular-nums">
                  {i + 1}
                </div>
                <div className="min-w-0">
                  <a
                    href={hnItemHref(s.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-text-primary hover:text-[color:var(--v2-acc)] truncate block"
                    title={s.title}
                  >
                    {s.title}
                  </a>
                  <div className="sm:hidden mt-0.5 flex items-center gap-2 text-[10px] tabular-nums" style={{ color: "var(--v2-ink-400)" }}>
                    <span>{s.descendants.toLocaleString("en-US")} cmts</span>
                    <span>·</span>
                    <span>{formatAgeHours(s.ageHours)}</span>
                  </div>
                </div>
                <div className="hidden sm:block text-right">
                  {s.everHitFrontPage ? (
                    <span
                      className="inline-flex items-center justify-center text-[8px] font-bold w-3.5 h-3.5 rounded-sm text-white"
                      style={{ backgroundColor: HN_ORANGE }}
                      title="Hit the HN front page"
                    >
                      Y
                    </span>
                  ) : (
                    <span className="text-text-tertiary text-[10px]">—</span>
                  )}
                </div>
                <div
                  className="text-right text-xs tabular-nums"
                  style={isHigh ? { color: HN_ORANGE } : undefined}
                >
                  {s.score.toLocaleString("en-US")}
                </div>
                <div className="hidden sm:block text-right text-xs tabular-nums text-text-secondary">
                  {s.descendants.toLocaleString("en-US")}
                </div>
                <div className="hidden sm:block text-right text-xs tabular-nums" style={{ color: "var(--v2-ink-400)" }}>
                  {formatAgeHours(s.ageHours)}
                </div>
              </li>
            );
          })}
        </ul>
      </ListShell>

      <FullViewLink href="/hackernews/trending" label="View full" />
    </>
  );
}
