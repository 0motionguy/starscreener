// /signals — V3 cross-source newsroom terminal.
//
// Replaces the older 5-source tabs shell. This page renders eight source
// panels (HN, GitHub, X, Reddit, Bluesky, Dev.to, Claude RSS, OpenAI RSS)
// plus four cross-source widgets:
//   - Signal Volume chart (24h stacked area, src/lib/signals/volume.ts)
//   - Consensus Radar (stories in 3+ sources, src/lib/signals/consensus.ts)
//   - Tag Momentum heatmap (12 tags × 24h, src/lib/signals/tag-momentum.ts)
//   - Live ticker (cross-source highlights)
//
// Every panel reads through the data-store refresh pattern so cold Vercel
// Lambdas serve the bundled JSON snapshot and warm ones see Redis-fresh
// data. No file reads on the render path.

import { Suspense } from "react";

import {
  refreshTrendingFromStore,
  getTrending,
  getLastFetchedAt,
} from "@/lib/trending";
import {
  refreshHackernewsTrendingFromStore,
  getHnTopStories,
} from "@/lib/hackernews-trending";
import { hnFetchedAt } from "@/lib/hackernews";
import {
  refreshBlueskyTrendingFromStore,
  getBlueskyTopPosts,
} from "@/lib/bluesky-trending";
import { blueskyFetchedAt } from "@/lib/bluesky";
import {
  refreshDevtoTrendingFromStore,
  getDevtoTopArticles,
} from "@/lib/devto-trending";
import { devtoFetchedAt } from "@/lib/devto";
import {
  getAllRedditPosts,
  getRedditFetchedAt,
} from "@/lib/reddit-data";
import {
  refreshClaudeRssFromStore,
  refreshOpenaiRssFromStore,
  getClaudeRssTop,
  getOpenaiRssTop,
  claudeFetchedAt,
  openaiFetchedAt,
} from "@/lib/rss-feeds";
import {
  getTopTwitterBuzz,
  getTopTwitterPosts,
  getTwitterLatestUpdatedAt,
} from "@/lib/twitter/trending-tweets";

import {
  hnToSignalItems,
  redditToSignalItems,
  bskyToSignalItems,
  devtoToSignalItems,
  githubToSignalItems,
  twitterToSignalItems,
  rssToSignalItems,
} from "@/lib/signals/build-items";
import { buildConsensus } from "@/lib/signals/consensus";
import { buildVolume } from "@/lib/signals/volume";
import { buildTagMomentum } from "@/lib/signals/tag-momentum";
import type { SignalItem, SourceKey } from "@/lib/signals/types";

import { LiveClock } from "@/components/signals-terminal/LiveClock";
import {
  LiveTicker,
  type TickerItem,
} from "@/components/signals-terminal/LiveTicker";
import { KpiStrip } from "@/components/signals-terminal/KpiStrip";
import { VolumeAreaChart } from "@/components/signals-terminal/VolumeAreaChart";
import { ConsensusRadar } from "@/components/signals-terminal/ConsensusRadar";
import {
  SourceFeedPanel,
  type ListItem,
  type TweetItem,
  type RssArticleItem,
} from "@/components/signals-terminal/SourceFeedPanel";
import { TagMomentumHeatmap } from "@/components/signals-terminal/TagMomentumHeatmap";
import {
  SourceFilterBar,
  parseActiveSources,
  parseTimeWindow,
  parseTopic,
  windowHours,
  windowLabel,
} from "@/components/signals-terminal/SourceFilterBar";
import { matchesTopic } from "@/lib/signals/topics";

import { triggerScanIfStale } from "@/lib/news/auto-rescrape";

import "./signals.css";

// ISR — same cadence as the homepage so collectors don't trigger redeploys.
export const revalidate = 1800;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ageLabel(iso: string | null | undefined): string {
  if (!iso) return "no data yet";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function compactNumber(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function safeTrigger(
  source: Parameters<typeof triggerScanIfStale>[0],
  ts: string | null | undefined,
) {
  try {
    void triggerScanIfStale(source, ts);
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface SignalsPageProps {
  // Next 15 hands searchParams as a Promise. Reading is async.
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SignalsPage({ searchParams: _sp }: SignalsPageProps) {
  // BISECT phase 4: simple text log, no JSX magic.
  const lines: string[] = [];
  async function step(name: string, fn: () => unknown | Promise<unknown>) {
    try {
      await fn();
      lines.push(`OK   ${name}`);
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      lines.push(`FAIL ${name}: ${m}`);
    }
  }

  await step("refresh:trending", () => refreshTrendingFromStore());
  await step("refresh:hn", () => refreshHackernewsTrendingFromStore());
  await step("refresh:bsky", () => refreshBlueskyTrendingFromStore());
  await step("refresh:devto", () => refreshDevtoTrendingFromStore());
  await step("refresh:claude", () => refreshClaudeRssFromStore());
  await step("refresh:openai", () => refreshOpenaiRssFromStore());
  await step("getTrending", () => getTrending("past_24_hours", "All"));
  await step("getLastFetchedAt", () => getLastFetchedAt());
  await step("getHnTopStories", () => getHnTopStories(60));
  await step("getAllRedditPosts", () => getAllRedditPosts());
  await step("getBlueskyTopPosts", () => getBlueskyTopPosts(60));
  await step("getDevtoTopArticles", () => getDevtoTopArticles(40));
  await step("getClaudeRssTop", () => getClaudeRssTop(20));
  await step("getOpenaiRssTop", () => getOpenaiRssTop(20));
  await step("getTopTwitterBuzz", () => getTopTwitterBuzz(20));
  await step("getTopTwitterPosts", () => getTopTwitterPosts(20));
  await step("getTwitterLatestUpdatedAt", () => getTwitterLatestUpdatedAt());

  return (
    <main style={{ padding: 24, fontFamily: "monospace", fontSize: 12 }}>
      <h1>signals bisect — per-step</h1>
      <pre style={{ whiteSpace: "pre-wrap" }}>{lines.join("\n")}</pre>
    </main>
  );
}

async function _signalsPageBody({ searchParams }: SignalsPageProps) {
  const sp = (await searchParams) ?? {};
  const srcParam = Array.isArray(sp.src) ? sp.src.join(",") : sp.src;
  const wParam = Array.isArray(sp.w) ? sp.w[0] : sp.w;
  const topicParam = Array.isArray(sp.topic) ? sp.topic[0] : sp.topic;
  const activeSourceFilter = parseActiveSources(srcParam);
  const activeWindow = parseTimeWindow(wParam);
  const activeTopic = parseTopic(topicParam);
  const lookbackHours = windowHours(activeWindow);
  const activeWindowLabel = windowLabel(activeWindow);

  // Refresh every source from the data-store in parallel. None of these
  // throw — they degrade silently to bundled JSON / memory when Redis is
  // unreachable.
  await Promise.all([
    refreshTrendingFromStore(),
    refreshHackernewsTrendingFromStore(),
    refreshBlueskyTrendingFromStore(),
    refreshDevtoTrendingFromStore(),
    refreshClaudeRssFromStore(),
    refreshOpenaiRssFromStore(),
  ]);

  // ── Pull source records ----------------------------------------------------
  const ghRows = getTrending("past_24_hours", "All").slice(0, 50);
  const ghFetchedAt = getLastFetchedAt();
  const hnTop = getHnTopStories(60);
  const redditAll = getAllRedditPosts();
  const bskyTop = getBlueskyTopPosts(60);
  const devtoTop = getDevtoTopArticles(40);
  const claudeTop = getClaudeRssTop(20);
  const openaiTop = getOpenaiRssTop(20);
  const twBuzz = getTopTwitterBuzz(20);
  const twPosts = getTopTwitterPosts(20);
  const twLatestAt = getTwitterLatestUpdatedAt();

  // ── Auto-rescrape stale sources (best-effort) -----------------------------
  safeTrigger("hackernews", hnFetchedAt || null);
  safeTrigger("reddit", getRedditFetchedAt());
  safeTrigger("bluesky", blueskyFetchedAt);
  safeTrigger("devto", devtoFetchedAt || null);

  // ── Build SignalItem[] across all 8 sources -------------------------------
  const items: SignalItem[] = [
    ...hnToSignalItems(hnTop),
    ...redditToSignalItems(redditAll),
    ...bskyToSignalItems(bskyTop),
    ...devtoToSignalItems(devtoTop),
    ...githubToSignalItems(ghRows, ghFetchedAt),
    ...twitterToSignalItems(twPosts),
    ...rssToSignalItems(claudeTop, "claude"),
    ...rssToSignalItems(openaiTop, "openai"),
  ];

  // ── Cross-source synthesis -------------------------------------------------
  // The synthesis layer (volume / consensus / heatmap / ticker) operates on
  // a filtered view of items; per-source feed panels always render their
  // own native data regardless of the URL filter.
  const nowMs = Date.now();
  const cutoffMs = nowMs - lookbackHours * 3_600_000;
  const filteredItems = items.filter(
    (it) =>
      activeSourceFilter.has(it.source) &&
      // Items missing a usable timestamp (some GitHub trending rows) are
      // kept so they don't disappear on shorter windows. They cluster at
      // the dataset's fetchedAt which lives inside any reasonable window.
      (it.postedAtMs === 0 || it.postedAtMs >= cutoffMs) &&
      // Topic filter is inclusive — null = all topics, otherwise the
      // item must hit at least one of the topic's keyword patterns.
      (activeTopic === null || matchesTopic(it, activeTopic)),
  );

  const volume = buildVolume(filteredItems, { nowMs, lookbackHours });
  const tagMomentum = buildTagMomentum(filteredItems, {
    nowMs,
    topN: 12,
    lookbackHours,
  });

  // Consensus: strong signals (3+ sources) come first. When the panel would
  // be sparse (< 5 strong stories), top up with the next-best near-consensus
  // items so the slot doesn't read as half-empty. The KPI strip's
  // "Consensus stories" count tracks the strong-only number.
  // When the user filters down to <3 sources, consensus drops minSources
  // proportionally so the radar still has something to show.
  const minStrongSources = Math.min(3, activeSourceFilter.size);
  const strongConsensus = buildConsensus(filteredItems, {
    nowMs,
    minSources: minStrongSources,
    limit: 8,
    lookbackHours,
  });
  const consensusCount = strongConsensus.length;
  let consensus = strongConsensus;
  if (consensus.length < 5) {
    const nearConsensus = buildConsensus(filteredItems, {
      nowMs,
      minSources: 1,
      limit: 12,
      lookbackHours,
    }).filter(
      (s) => !strongConsensus.some((c) => c.key === s.key),
    );
    consensus = [...strongConsensus, ...nearConsensus].slice(0, 8);
  }

  // ── KPI calculations -------------------------------------------------------
  const activeSources = (Object.entries(volume.perSource) as [SourceKey, number][])
    .filter(([, n]) => n > 0).length;

  const dominantPct =
    volume.totalItems > 0
      ? (volume.perSource[volume.dominantSource] / volume.totalItems) * 100
      : 0;

  // "Alpha score" = average of top-5 consensus story scores, capped 0..100.
  const topConsensus = consensus.slice(0, 5);
  const alphaScore =
    topConsensus.length === 0
      ? 0
      : Math.min(
          100,
          topConsensus.reduce((sum, s) => sum + s.score, 0) / (topConsensus.length * 4),
        );
  const alphaDelta = consensus.reduce((d, s) => d + s.delta, 0);

  const freshnessIso =
    [
      hnFetchedAt,
      getRedditFetchedAt(),
      blueskyFetchedAt,
      devtoFetchedAt,
      claudeFetchedAt(),
      openaiFetchedAt(),
      ghFetchedAt,
      twLatestAt,
    ]
      .filter((s): s is string => typeof s === "string" && s.length > 0)
      .sort()
      .pop() ?? null;
  const freshnessLabel = ageLabel(freshnessIso);

  // ── Per-source feed payloads ---------------------------------------------
  const hnList: ListItem[] = hnTop.slice(0, 7).map((s) => ({
    id: `hn:${s.id}`,
    title: s.title,
    href: s.url || `https://news.ycombinator.com/item?id=${s.id}`,
    external: true,
    attribution: s.by,
    age: ageLabel(new Date(s.createdUtc * 1000).toISOString()),
    pts: `${s.score}↑`,
    chg: s.descendants ? `${s.descendants}c` : null,
    chgDown: false,
  }));

  const ghList: ListItem[] = ghRows.slice(0, 7).map((r) => {
    const stars = Number.parseInt(r.stars ?? "0", 10) || 0;
    return {
      id: `gh:${r.repo_id || r.repo_name}`,
      title: r.repo_name,
      href: `/repo/${r.repo_name}`,
      external: false,
      attribution: r.primary_language || "—",
      age: ageLabel(ghFetchedAt),
      pts: compactNumber(stars),
      chg: r.total_score ? `+${Math.round(Number(r.total_score))}` : null,
      chgDown: false,
    };
  });

  const redditList: ListItem[] = redditAll
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 7)
    .map((p) => ({
      id: `reddit:${p.id}`,
      title: p.title,
      href: p.url || `https://www.reddit.com${p.permalink}`,
      external: true,
      attribution: `r/${p.subreddit} · u/${p.author}`,
      age: ageLabel(new Date(p.createdUtc * 1000).toISOString()),
      pts: `${compactNumber(p.score)}↑`,
      chg: p.numComments ? `${p.numComments}c` : null,
      chgDown: false,
    }));

  const xTweets: TweetItem[] = twPosts.slice(0, 5).map((t) => ({
    id: `x:${t.postId}`,
    avatar: (t.authorHandle || "?").slice(0, 2).toUpperCase(),
    name: t.authorHandle,
    handle: `@${t.authorHandle}`,
    age: ageLabel(t.postedAt),
    text: t.text || "(no text)",
    stats: [
      { label: "engage", value: compactNumber(t.engagement) },
      {
        label: "repo",
        value: t.repoFullName.split("/")[1] ?? t.repoFullName,
      },
    ],
    href: t.postUrl || "#",
  }));

  // Fallback: when no individual tweets are available (cold collector data),
  // surface the per-repo Twitter buzz aggregates as tweet-style cards so the
  // panel still feels alive instead of showing an empty state.
  const xTweetsOrBuzz: TweetItem[] =
    xTweets.length > 0
      ? xTweets
      : twBuzz.slice(0, 5).map((b) => ({
          id: `xbuzz:${b.fullName}`,
          avatar: (b.repoName || b.fullName).slice(0, 2).toUpperCase(),
          // Prefix "BUZZ ·" so the card visually signals it's a per-repo
          // aggregate, not an individual tweet. Avoids reading like a fake
          // KOL display name (would mislead the eye).
          name: `BUZZ · ${b.fullName}`,
          handle: `${b.mentionCount24h} mentions / 24h`,
          age: ageLabel(b.updatedAt),
          text: `${b.uniqueAuthors24h} unique authors · ${compactNumber(
            b.engagementTotal,
          )} engagement total.${
            b.badgeLabel ? ` Badge: ${b.badgeLabel}.` : ""
          }`,
          stats: [
            { label: "score", value: b.finalScore.toFixed(1) },
            { label: "auth", value: String(b.uniqueAuthors24h) },
          ],
          href: b.topPostUrl || b.githubUrl,
        }));

  const bskyTweets: TweetItem[] = bskyTop.slice(0, 5).map((p) => ({
    id: `bsky:${p.uri}`,
    avatar: (p.author?.handle || "?").slice(0, 2).toUpperCase(),
    name: p.author?.displayName ?? p.author?.handle ?? "unknown",
    handle: `@${p.author?.handle ?? "unknown"}`,
    age: ageLabel(p.createdAt),
    text: p.text || "(no text)",
    stats: [
      { label: "♥", value: compactNumber(p.likeCount) },
      { label: "rt", value: compactNumber(p.repostCount) },
    ],
    href: p.bskyUrl || "#",
  }));

  const devtoArticles: RssArticleItem[] = devtoTop.slice(0, 4).map((a) => ({
    id: `devto:${a.id}`,
    category: (a.tags?.[0] ?? "POST").toUpperCase(),
    catColor: "var(--source-dev)",
    title: a.title,
    desc: a.description,
    href: a.url,
    author: a.author?.username ?? "—",
    age: ageLabel(a.publishedAt),
    reads: a.reactionsCount ? `${compactNumber(a.reactionsCount)}` : null,
  }));

  const claudeArticles: RssArticleItem[] = claudeTop.slice(0, 4).map((a) => ({
    id: `claude:${a.id}`,
    category: a.category || "POST",
    catColor: "var(--source-claude)",
    title: a.title,
    desc: a.summary,
    href: a.url || "#",
    author: a.author || "Anthropic",
    age: ageLabel(a.publishedAt),
    reads: null,
  }));

  const openaiArticles: RssArticleItem[] = openaiTop.slice(0, 4).map((a) => ({
    id: `openai:${a.id}`,
    category: a.category || "POST",
    catColor: "var(--source-openai)",
    title: a.title,
    desc: a.summary,
    href: a.url || "#",
    author: a.author || "OpenAI",
    age: ageLabel(a.publishedAt),
    reads: null,
  }));

  const tickerItems: TickerItem[] = buildTickerItems(filteredItems);

  // TEMP bisect: minimal render to isolate data-layer vs JSX-layer
  // failure. If this returns 200, the data layer is fine and the bug is
  // in one of the V3 components. If it still 500s, the data layer
  // (imports, refresh hooks, SignalItem builders) is the culprit.
  if (process.env.NEXT_PUBLIC_SIGNALS_BISECT !== "off") {
    return (
      <main style={{ padding: 24, fontFamily: "monospace" }}>
        <h1>signals bisect — data layer reached</h1>
        <p>items: {items.length}</p>
        <p>filtered: {filteredItems.length}</p>
        <p>volume.totalItems: {volume.totalItems}</p>
        <p>consensus: {consensus.length}</p>
        <p>tags: {tagMomentum.rows.length}</p>
        <p>ticker: {tickerItems.length}</p>
      </main>
    );
  }

  // ── Render ----------------------------------------------------------------
  return (
    <main className="signals-page" style={{ padding: "14px 16px 60px" }}>
      <header
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 18,
          padding: "4px 0 12px",
          borderBottom: "1px solid var(--color-border-default)",
          marginBottom: 14,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.20em",
              color: "var(--color-text-subtle)",
              textTransform: "uppercase",
              fontFamily: "var(--font-mono)",
            }}
          >
            <b style={{ color: "var(--color-accent)", fontWeight: 600 }}>
              SIGNAL
            </b>{" "}
            · TERMINAL · /SIGNALS
          </div>
          <h1
            style={{
              margin: "6px 0 0",
              fontFamily: "var(--font-sans)",
              fontWeight: 500,
              fontSize: 30,
              letterSpacing: "-0.024em",
              color: "var(--color-text-default)",
              lineHeight: 1.05,
            }}
          >
            The newsroom for AI &amp; dev tooling.
          </h1>
          <p
            style={{
              margin: "6px 0 0",
              color: "var(--color-text-subtle)",
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              lineHeight: 1.5,
              maxWidth: 560,
            }}
          >
            Eight sources, one editorial layer. Cross-source consensus
            surfaces the stories that matter — everything else stays one click
            away.
          </p>
        </div>
        <Suspense fallback={null}>
          <LiveClock initialIso={new Date().toISOString()} />
        </Suspense>
      </header>

      <SourceFilterBar
        active={activeSourceFilter}
        timeWindow={activeWindow}
        topic={activeTopic}
        totalSignals={volume.totalItems}
      />

      <div style={{ marginBottom: 10 }}>
        <KpiStrip
          totalSignals={volume.totalItems}
          changePct={volume.changePct}
          activeSources={activeSources}
          totalSources={8}
          topTag={tagMomentum.topTag?.tag ?? null}
          topTagDelta={tagMomentum.topTag?.delta ?? null}
          topTagCount={tagMomentum.topTag?.count ?? null}
          consensusCount={consensusCount}
          alphaScore={alphaScore}
          alphaDelta={alphaDelta}
          freshnessLabel={freshnessLabel}
          windowLabel={activeWindowLabel}
        />
      </div>

      {/* Row 1: Volume chart + Consensus radar */}
      <div className="grid">
        <div className="col-7">
          <VolumeAreaChart
            buckets={volume.buckets}
            totalItems={volume.totalItems}
            changePct={volume.changePct}
            peakHour={volume.peakHour}
            peakTotal={volume.peakTotal}
            quietHour={volume.quietHour}
            quietTotal={volume.quietTotal}
            dominantSource={volume.dominantSource}
            dominantPct={dominantPct}
          />
        </div>
        <div className="col-5">
          <ConsensusRadar
            stories={consensus}
            totalActive={consensusCount}
          />
        </div>
      </div>

      <SectionHead
        num="// 03"
        title="Primary feeds"
        meta="4 · sorted by velocity"
      />
      <div className="grid">
        <div className="col-3">
          <SourceFeedPanel
            source="hn"
            title="HACKER NEWS"
            countLabel={String(hnTop.length)}
            freshLabel={`updated ${ageLabel(hnFetchedAt)}`}
            footerHref="/hackernews/trending"
            footerLabel={`view all ${hnTop.length}`}
            feed={{ variant: "list", items: hnList }}
          />
        </div>
        <div className="col-3">
          <SourceFeedPanel
            source="github"
            title="GITHUB · TRENDING"
            countLabel={String(ghRows.length)}
            freshLabel={`updated ${ageLabel(ghFetchedAt)}`}
            footerHref="/"
            footerLabel="view trending"
            feed={{ variant: "list", items: ghList }}
          />
        </div>
        <div className="col-3">
          <SourceFeedPanel
            source="x"
            title="X · KOL FEED"
            countLabel={String(twPosts.length || twBuzz.length)}
            freshLabel={`updated ${ageLabel(twLatestAt)}`}
            footerHref="/"
            footerLabel="view all"
            feed={{ variant: "tweet", items: xTweetsOrBuzz }}
          />
        </div>
        <div className="col-3">
          <SourceFeedPanel
            source="reddit"
            title="REDDIT · ML/LLM"
            countLabel={String(redditAll.length)}
            freshLabel={`updated ${ageLabel(getRedditFetchedAt())}`}
            footerHref="/reddit/trending"
            footerLabel={`view all ${redditAll.length}`}
            feed={{ variant: "list", items: redditList }}
          />
        </div>
      </div>

      <SectionHead
        num="// 04"
        title="Secondary & editorial"
        meta="4 · curated"
      />
      <div className="grid">
        <div className="col-3">
          <SourceFeedPanel
            source="bluesky"
            title="BLUESKY"
            countLabel={String(bskyTop.length)}
            freshLabel={`updated ${ageLabel(blueskyFetchedAt)}`}
            footerHref="/bluesky/trending"
            footerLabel="view all"
            feed={{ variant: "tweet", items: bskyTweets }}
          />
        </div>
        <div className="col-3">
          <SourceFeedPanel
            source="devto"
            title="DEV.TO"
            countLabel={String(devtoTop.length)}
            freshLabel={`updated ${ageLabel(devtoFetchedAt)}`}
            footerHref="/devto"
            footerLabel={`view all ${devtoTop.length}`}
            feed={{ variant: "rss", items: devtoArticles }}
          />
        </div>
        <div className="col-3">
          <SourceFeedPanel
            source="claude"
            title="CLAUDE · RSS"
            countLabel={String(claudeTop.length)}
            freshLabel={`updated ${ageLabel(claudeFetchedAt())}`}
            footerHref="https://www.anthropic.com/news"
            footerLabel="anthropic.com/news"
            feed={{ variant: "rss", items: claudeArticles }}
          />
        </div>
        <div className="col-3">
          <SourceFeedPanel
            source="openai"
            title="OPENAI · RSS"
            countLabel={String(openaiTop.length)}
            freshLabel={`updated ${ageLabel(openaiFetchedAt())}`}
            footerHref="https://openai.com/news"
            footerLabel="openai.com/news"
            feed={{ variant: "rss", items: openaiArticles }}
          />
        </div>
      </div>

      <SectionHead
        num="// 05"
        title="Tag momentum · 24h heatmap"
        meta={`${tagMomentum.rows.length} tags · hourly buckets`}
      />
      <TagMomentumHeatmap rows={tagMomentum.rows} />

      <LiveTicker items={tickerItems} />
    </main>
  );
}

// ---------------------------------------------------------------------------
// SectionHead — uses existing .sec-head / .sec-num / .sec-title / .sec-meta
// utilities from src/app/globals.css so it inherits the project-wide mobile
// flex-direction collapse instead of fighting it with inline styles.
// ---------------------------------------------------------------------------

function SectionHead({
  num,
  title,
  meta,
}: {
  num: string;
  title: string;
  meta: string;
}) {
  return (
    <div className="sec-head">
      <span className="sec-num">{num}</span>
      <h2 className="sec-title">{title}</h2>
      <span className="sec-meta">{meta}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Build ticker — most-recent items across all sources, capped 24
// ---------------------------------------------------------------------------

function buildTickerItems(items: SignalItem[]): TickerItem[] {
  const SRC_LABEL: Record<SourceKey, string> = {
    hn: "HN",
    github: "GH",
    x: "X",
    reddit: "RDT",
    bluesky: "BSKY",
    devto: "DEV",
    claude: "CLA",
    openai: "OAI",
  };

  const byTime = items
    .filter((it) => it.postedAtMs > 0)
    .slice()
    .sort((a, b) => b.postedAtMs - a.postedAtMs)
    .slice(0, 24);

  return byTime.map((it) => ({
    source: it.source,
    label: SRC_LABEL[it.source],
    text: it.title.length > 80 ? it.title.slice(0, 77) + "…" : it.title,
    value: it.engagement > 0 ? `${shortNum(it.engagement)}↑` : "NEW",
    down: false,
  }));
}

function shortNum(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
