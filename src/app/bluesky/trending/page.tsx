// /bluesky/trending — engagement-ranked Bluesky feed.
//
// Mirrors /hackernews/trending's rhythm: header strip, 4 stat tiles,
// list below. Shows the top 50 posts merged across curated AI query
// families (agents, LLMs, coding agents, MCP, workflow, etc.), scored
// by likes + 2*reposts + 0.5*replies. Any post that linked to a tracked
// github.com repo surfaces a clickable pill.

import {
  BLUESKY_TRENDING_KEYWORDS,
  getBlueskyTopPosts,
  getBlueskyTrendingFile,
} from "@/lib/bluesky-trending";
import {
  blueskyCold,
  getBlueskyLeaderboard,
  repoFullNameToHref,
} from "@/lib/bluesky";

export const dynamic = "force-static";

const BSKY_BLUE = "#0085FF";

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

export default function BlueskyTrendingPage() {
  const trendingFile = getBlueskyTrendingFile();
  const posts = getBlueskyTopPosts(50);
  const allPosts = trendingFile.posts;
  const reposLinked = getBlueskyLeaderboard().length;
  const familyCount = trendingFile.queryFamilies?.length ?? BLUESKY_TRENDING_KEYWORDS.length;
  const queryCount = trendingFile.queries?.length ?? BLUESKY_TRENDING_KEYWORDS.length;
  const cold = blueskyCold || allPosts.length === 0;

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        {/* Header */}
        <header className="mb-6 border-b border-border-primary pb-6">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-2xl font-bold uppercase tracking-wider">
              BLUESKY / ALL TRENDING
            </h1>
            <span className="text-xs text-text-tertiary">
              {"// AT Protocol · AI query families · engagement-ranked"}
            </span>
          </div>
          <p className="mt-2 text-sm text-text-secondary max-w-2xl">
            Top posts from Bluesky{" "}
            <code className="text-text-primary">searchPosts</code>, deduped
            across {queryCount} curated query slices in {familyCount} AI topic
            families ({BLUESKY_TRENDING_KEYWORDS.map((k) => `"${k}"`).join(", ")})
            plus a parallel <code className="text-text-primary">github.com</code>{" "}
            sweep that surfaces posts mentioning tracked repos. Score:{" "}
            <code className="text-text-primary">likes + 2·reposts + 0.5·replies</code>.
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
                label="POSTS TRACKED"
                value={allPosts.length.toLocaleString()}
                hint={`${queryCount} queries across ${familyCount} families`}
              />
              <StatTile
                label="TOPIC FAMILIES"
                value={familyCount.toLocaleString()}
                hint={BLUESKY_TRENDING_KEYWORDS.slice(0, 3).join(" · ")}
              />
              <StatTile
                label="REPOS LINKED"
                value={reposLinked.toLocaleString()}
                hint="github repos mentioned 7d"
              />
            </section>

            {/* Feed */}
            <section className="border border-border-primary rounded-md bg-bg-secondary overflow-hidden">
              <div className="grid grid-cols-[40px_1fr_120px_60px_60px_60px_60px] gap-3 items-center px-3 h-9 border-b border-border-primary text-[10px] uppercase tracking-wider text-text-tertiary">
                <div>#</div>
                <div>POST</div>
                <div>KEYWORD</div>
                <div className="text-right">♥</div>
                <div className="text-right">⟲</div>
                <div className="text-right">CMTS</div>
                <div className="text-right">AGE</div>
              </div>
              <ul>
                {posts.map((p, i) => {
                  const linkedRepo = p.linkedRepos?.[0]?.fullName;
                  const snippet =
                    p.text.length > 140 ? `${p.text.slice(0, 140)}…` : p.text;
                  const isHighSignal = p.likeCount >= 50 || p.repostCount >= 5;
                  const topicLabel = p.matchedTopicLabel ?? p.matchedKeyword;
                  return (
                    <li
                      key={p.uri}
                      className="grid grid-cols-[40px_1fr_120px_60px_60px_60px_60px] gap-3 items-start px-3 py-2 hover:bg-bg-card-hover border-b border-border-primary/40 last:border-b-0"
                    >
                      <div className="text-text-tertiary text-xs tabular-nums pt-0.5">
                        {i + 1}
                      </div>
                      <div className="min-w-0 flex flex-col gap-1">
                        <a
                          href={p.bskyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-text-primary hover:text-accent-green line-clamp-2"
                          title={p.text}
                        >
                          {snippet}
                        </a>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="text-[10px] text-text-tertiary"
                            title={
                              p.author.displayName
                                ? `${p.author.displayName} (@${p.author.handle})`
                                : `@${p.author.handle}`
                            }
                          >
                            @{p.author.handle}
                          </span>
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
                      </div>
                      <div>
                        {topicLabel ? (
                          <span
                            className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border font-mono"
                            style={{
                              color: BSKY_BLUE,
                              borderColor: `${BSKY_BLUE}4D`,
                              backgroundColor: `${BSKY_BLUE}0D`,
                            }}
                            title={
                              p.matchedQuery
                                ? `Matched topic: ${topicLabel} · query: ${p.matchedQuery}`
                                : `Matched topic: ${topicLabel}`
                            }
                          >
                            {topicLabel}
                          </span>
                        ) : (
                          <span className="text-text-tertiary text-[10px]">—</span>
                        )}
                      </div>
                      <div
                        className="text-right text-xs tabular-nums"
                        style={isHighSignal ? { color: BSKY_BLUE } : undefined}
                      >
                        {p.likeCount.toLocaleString()}
                      </div>
                      <div className="text-right text-xs tabular-nums text-text-secondary">
                        {p.repostCount.toLocaleString()}
                      </div>
                      <div className="text-right text-xs tabular-nums text-text-secondary">
                        {p.replyCount.toLocaleString()}
                      </div>
                      <div className="text-right text-xs tabular-nums text-text-tertiary">
                        {formatAgeHours(p.ageHours)}
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
        The Bluesky scraper hasn&apos;t run yet. Run{" "}
        <code className="text-text-primary">npm run scrape:bsky</code> locally
        (with <code className="text-text-primary">BLUESKY_HANDLE</code> +{" "}
        <code className="text-text-primary">BLUESKY_APP_PASSWORD</code> in env)
        to populate{" "}
        <code className="text-text-primary">
          data/bluesky-trending.json
        </code>
        , then refresh this page.
      </p>
    </section>
  );
}
