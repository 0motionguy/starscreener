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
  refreshBlueskyTrendingFromStore,
} from "@/lib/bluesky-trending";
import {
  blueskyCold,
  refreshBlueskyMentionsFromStore,
  repoFullNameToHref,
} from "@/lib/bluesky";
import { NewsTopHeaderV3 } from "@/components/news/NewsTopHeaderV3";
import { buildBlueskyHeader } from "@/components/news/newsTopMetrics";

const BSKY_ACCENT = "rgba(58, 214, 197, 0.85)";

export const dynamic = "force-static";

const BSKY_BLUE = "#0085FF";

function formatAgeHours(ageHours: number | undefined): string {
  if (ageHours === undefined || !Number.isFinite(ageHours)) return "—";
  if (ageHours < 1) return "<1h";
  if (ageHours < 24) return `${Math.round(ageHours)}h`;
  return `${Math.round(ageHours / 24)}d`;
}

export default async function BlueskyTrendingPage() {
  await Promise.all([
    refreshBlueskyTrendingFromStore(),
    refreshBlueskyMentionsFromStore(),
  ]);
  const trendingFile = getBlueskyTrendingFile();
  const posts = getBlueskyTopPosts(50);
  const allPosts = trendingFile.posts;
  const familyCount = trendingFile.queryFamilies?.length ?? BLUESKY_TRENDING_KEYWORDS.length;
  const queryCount = trendingFile.queries?.length ?? BLUESKY_TRENDING_KEYWORDS.length;
  const cold = blueskyCold || allPosts.length === 0;

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
            {"// AT PROTOCOL · AI QUERY FAMILIES · ENGAGEMENT-RANKED"}
          </div>
          <h1
            className="text-2xl font-bold uppercase tracking-wider"
            style={{ color: "var(--v3-ink-000)" }}
          >
            BLUESKY / ALL TRENDING
          </h1>
          <p
            className="mt-2 text-[13px] leading-relaxed max-w-2xl"
            style={{ color: "var(--v3-ink-300)" }}
          >
            Top posts from Bluesky{" "}
            <code style={{ color: "var(--v3-ink-100)" }}>searchPosts</code>, deduped
            across {queryCount} curated query slices in {familyCount} AI topic
            families plus a parallel{" "}
            <code style={{ color: "var(--v3-ink-100)" }}>github.com</code>{" "}
            sweep that surfaces posts mentioning tracked repos. Score:{" "}
            <code style={{ color: "var(--v3-ink-100)" }}>likes + 2·reposts + 0.5·replies</code>.
          </p>
        </header>

        {cold ? (
          <ColdState />
        ) : (
          <>
            {/* V3 top header — 3 charts + 3 hero posts. The legacy stat
                tiles below this were dropped — the V3 snapshot card +
                activity bars carry the same numbers in less space. */}
            <div className="mb-6">
              <NewsTopHeaderV3
                eyebrow="// BLUESKY · TOP POSTS"
                status={`${allPosts.length.toLocaleString("en-US")} TRACKED · 24H`}
                {...buildBlueskyHeader(trendingFile, getBlueskyTopPosts(3))}
                accent={BSKY_ACCENT}
              />
            </div>

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
                        {p.likeCount.toLocaleString("en-US")}
                      </div>
                      <div className="text-right text-xs tabular-nums text-text-secondary">
                        {p.repostCount.toLocaleString("en-US")}
                      </div>
                      <div className="text-right text-xs tabular-nums text-text-secondary">
                        {p.replyCount.toLocaleString("en-US")}
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
