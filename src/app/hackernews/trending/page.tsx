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
} from "@/lib/hackernews-trending";
import { getHnLeaderboard, hnItemHref, repoFullNameToHref } from "@/lib/hackernews";

export const dynamic = "force-static";

const HN_ORANGE = "#ff6600";

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "unknown";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatAgeHours(ageHours: number | undefined): string {
  if (ageHours === undefined || !Number.isFinite(ageHours)) return "—";
  if (ageHours < 1) return "<1h";
  if (ageHours < 24) return `${Math.round(ageHours)}h`;
  return `${Math.round(ageHours / 24)}d`;
}

export default function HackerNewsTrendingPage() {
  const trendingFile = getHnTrendingFile();
  const stories = getHnTopStories(50);
  const allStories = trendingFile.stories;
  const frontPageCount = allStories.filter((s) => s.everHitFrontPage).length;
  const reposLinked = getHnLeaderboard().length;
  const cold = allStories.length === 0;

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        {/* Header */}
        <header className="mb-6 border-b border-border-primary pb-6">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-2xl font-bold uppercase tracking-wider">
              HACKERNEWS / ALL TRENDING
            </h1>
            <span className="text-xs text-text-tertiary">
              {"// firebase top 500 + algolia 7d github mentions"}
            </span>
          </div>
          <p className="mt-2 text-sm text-text-secondary max-w-2xl">
            Every Hacker News story from the dual-source scrape: Firebase top
            500 (front page + new) merged with Algolia&apos;s 7d sweep for
            github-linked submissions. Stories are ranked by{" "}
            <code className="text-text-primary">trendingScore</code> —
            velocity (points/hour) weighted by log10(score) so a 200-pt rocket
            outranks a 1500-pt 3-day-old whale.
          </p>
        </header>

        {cold ? (
          <ColdState />
        ) : (
          <>
            {/* Stat tiles */}
            <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatTile
                label="LAST SCRAPE"
                value={formatRelative(trendingFile.fetchedAt)}
                hint={new Date(trendingFile.fetchedAt)
                  .toISOString()
                  .slice(0, 16)
                  .replace("T", " ")}
              />
              <StatTile
                label="STORIES TRACKED"
                value={allStories.length.toLocaleString()}
                hint={`${trendingFile.windowHours}h window · ${trendingFile.scannedTotal.toLocaleString()} scanned`}
              />
              <StatTile
                label="FRONT PAGE"
                value={frontPageCount.toLocaleString()}
                hint="ever hit top 30"
              />
              <StatTile
                label="REPOS LINKED"
                value={reposLinked.toLocaleString()}
                hint="github repos mentioned 7d"
              />
            </section>

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
                        {s.score.toLocaleString()}
                      </div>
                      <div className="text-right text-xs tabular-nums text-text-secondary">
                        {s.descendants.toLocaleString()}
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

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="border border-border-primary rounded-md px-4 py-3 bg-bg-secondary">
      <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold truncate">{value}</div>
      {hint ? (
        <div className="mt-0.5 text-[11px] text-text-tertiary truncate">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

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
