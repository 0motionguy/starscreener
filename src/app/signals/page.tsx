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
//
// AGN-711 (Lighthouse perf): the 8 SourceFeedPanels are wrapped in
// individual <Suspense> boundaries and each one runs its own data-store
// refresh inside its subtree. The page chrome (PageHead, filter bar, KPI
// strip, volume / consensus / tag-momentum widgets) ships first against
// the in-memory cache; panels stream in as their refreshes resolve.

import type { Metadata } from "next";
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
  refreshTwitterSignalsFromStore,
} from "@/lib/twitter";

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
import { SOURCE_BRAND_COLOR } from "@/components/signals-terminal/SourceMark";
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

// V4 (CORPUS) primitives — page chrome.
// /signals is the proof-of-concept consumer; this is the canonical
// migration shape other Phase 2 worktrees will follow.
import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";

import "./signals.css";

// ISR — same cadence as the homepage so collectors don't trigger redeploys.
export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Signals — Cross-Source Newsroom",
  description:
    "Eight-source live signal terminal: Hacker News, GitHub, X, Reddit, Bluesky, Dev.to, Claude RSS, OpenAI RSS — plus volume, consensus stories, and tag-momentum.",
  alternates: { canonical: "/signals" },
  openGraph: {
    title: "Signals — Cross-Source Newsroom — TrendingRepo",
    description: "Eight-source live signal terminal with volume, consensus, and tag-momentum.",
    url: "/signals",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Signals — Cross-Source Newsroom — TrendingRepo",
    description: "Eight-source live signal terminal with volume, consensus, and tag-momentum.",
  },
};

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

export default async function SignalsPage({ searchParams }: SignalsPageProps) {
  const sp = (await searchParams) ?? {};
  const srcParam = Array.isArray(sp.src) ? sp.src.join(",") : sp.src;
  const wParam = Array.isArray(sp.w) ? sp.w[0] : sp.w;
  const topicParam = Array.isArray(sp.topic) ? sp.topic[0] : sp.topic;
  const activeSourceFilter = parseActiveSources(srcParam);
  const activeWindow = parseTimeWindow(wParam);
  const activeTopic = parseTopic(topicParam);
  const lookbackHours = windowHours(activeWindow);
  const activeWindowLabel = windowLabel(activeWindow);

  // ── Pull source records ----------------------------------------------------
  // AGN-711: refreshes are no longer awaited at the page level — each
  // SourceFeedPanel below runs its own refresh inside a Suspense boundary
  // so the page chrome (head, filter bar, KPI strip, volume / consensus /
  // tag-momentum widgets) ships first and panels stream in. Cross-source
  // widgets read whatever the in-memory cache holds at this moment; on a
  // cold lambda that's the bundled JSON snapshot (architectural intent),
  // and on warm lambdas it's the most recent Redis pull.
  const ghRows = getTrending("past_24_hours", "All").slice(0, 50);
  const ghFetchedAt = getLastFetchedAt();
  const hnTop = getHnTopStories(60);
  const redditAll = getAllRedditPosts();
  const bskyTop = getBlueskyTopPosts(60);
  const devtoTop = getDevtoTopArticles(40);
  const claudeTop = getClaudeRssTop(20);
  const openaiTop = getOpenaiRssTop(20);
  const twPosts = getTopTwitterPosts(20);

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
  const windowTopicItems = items.filter(
    (it) =>
      // Items missing a usable timestamp (some GitHub trending rows) are
      // kept so they don't disappear on shorter windows. They cluster at
      // the dataset's fetchedAt which lives inside any reasonable window.
      (it.postedAtMs === 0 || it.postedAtMs >= cutoffMs) &&
      // Topic filter is inclusive — null = all topics, otherwise the
      // item must hit at least one of the topic's keyword patterns.
      (activeTopic === null || matchesTopic(it, activeTopic)),
  );

  const filteredItems = windowTopicItems.filter(
    (it) =>
      activeSourceFilter.has(it.source),
  );

  const sourceWindowVolume = buildVolume(windowTopicItems, { nowMs, lookbackHours });
  const volume = buildVolume(filteredItems, { nowMs, lookbackHours });
  const tagMomentum = buildTagMomentum(filteredItems, {
    nowMs,
    topN: 12,
    lookbackHours,
  });

  // Consensus: strong signals (3+ sources) come first, capped at 5. When
  // there aren't 5 strong stories we top up with near-consensus (1+ source)
  // — but only enough to fill 5 rows total, never more. KPI strip's
  // "Consensus stories" count tracks the strong-only number; the radar
  // header shows "+ N near" when padding is in play.
  // When the user filters down to <3 sources, minSources drops
  // proportionally so the radar still has something to show.
  const RADAR_LIMIT = 5;
  const minStrongSources = Math.min(3, activeSourceFilter.size);
  const strongConsensus = buildConsensus(filteredItems, {
    nowMs,
    minSources: minStrongSources,
    limit: RADAR_LIMIT,
    lookbackHours,
  });
  const consensusCount = strongConsensus.length;
  let consensus = strongConsensus;
  if (consensus.length < RADAR_LIMIT) {
    const nearConsensus = buildConsensus(filteredItems, {
      nowMs,
      minSources: 1,
      limit: RADAR_LIMIT * 2,
      lookbackHours,
    }).filter((s) => !strongConsensus.some((c) => c.key === s.key));
    consensus = [...strongConsensus, ...nearConsensus].slice(0, RADAR_LIMIT);
  }

  // ── KPI calculations -------------------------------------------------------
  const activeSources = (Object.entries(volume.perSource) as [SourceKey, number][])
    .filter(([, n]) => n > 0).length;

  const dominantPct =
    volume.totalItems > 0
      ? (volume.perSource[volume.dominantSource] / volume.totalItems) * 100
      : 0;

  // Alpha-score / heat-index calculation removed (2026-05-03) — the
  // "alpha score" framing read as market data on a code-trends newsroom.
  // Story-level intensity is already surfaced by the Consensus radar.

  const freshnessIso =
    [
      hnFetchedAt,
      getRedditFetchedAt(),
      blueskyFetchedAt,
      devtoFetchedAt,
      claudeFetchedAt(),
      openaiFetchedAt(),
      ghFetchedAt,
      getTwitterLatestUpdatedAt(),
    ]
      .filter((s): s is string => typeof s === "string" && s.length > 0)
      .sort()
      .pop() ?? null;
  const freshnessLabel = ageLabel(freshnessIso);

  const tickerItems: TickerItem[] = buildTickerItems(filteredItems);

  // ── Render ----------------------------------------------------------------
  return (
    <main className="signals-page" style={{ padding: "14px 16px 60px" }}>
      <PageHead
        crumb={
          <>
            <b>SIGNAL</b> · TERMINAL · /SIGNALS
          </>
        }
        h1="The newsroom for AI & dev tooling."
        lede="Eight sources, one editorial layer. Cross-source consensus surfaces the stories that matter — everything else stays one click away."
        clock={
          <Suspense fallback={null}>
            <LiveClock initialIso={new Date().toISOString()} />
          </Suspense>
        }
      />

      <SourceFilterBar
        active={activeSourceFilter}
        timeWindow={activeWindow}
        topic={activeTopic}
        sourceCounts={sourceWindowVolume.perSource}
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
          <Suspense fallback={<PanelSkeleton title="HACKER NEWS" source="hn" />}>
            <HnPanel />
          </Suspense>
        </div>
        <div className="col-3">
          <Suspense fallback={<PanelSkeleton title="GITHUB · TRENDING" source="github" />}>
            <GhPanel />
          </Suspense>
        </div>
        <div className="col-3">
          <Suspense fallback={<PanelSkeleton title="X · KOL FEED" source="x" />}>
            <XPanel />
          </Suspense>
        </div>
        <div className="col-3">
          <Suspense fallback={<PanelSkeleton title="REDDIT · ML/LLM" source="reddit" />}>
            <RedditPanel />
          </Suspense>
        </div>
      </div>

      <SectionHead
        num="// 04"
        title="Secondary & editorial"
        meta="4 · curated"
      />
      <div className="grid">
        <div className="col-3">
          <Suspense fallback={<PanelSkeleton title="BLUESKY" source="bluesky" />}>
            <BskyPanel />
          </Suspense>
        </div>
        <div className="col-3">
          <Suspense fallback={<PanelSkeleton title="DEV.TO" source="devto" />}>
            <DevtoPanel />
          </Suspense>
        </div>
        <div className="col-3">
          <Suspense fallback={<PanelSkeleton title="CLAUDE · RSS" source="claude" />}>
            <ClaudePanel />
          </Suspense>
        </div>
        <div className="col-3">
          <Suspense fallback={<PanelSkeleton title="OPENAI · RSS" source="openai" />}>
            <OpenaiPanel />
          </Suspense>
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
// Per-source streamed panels.
//
// Each component does its own data-store refresh, then computes its slice
// and returns a <SourceFeedPanel/>. Because they're rendered inside
// <Suspense> boundaries above, the page chrome ships first and these
// stream in independently as their refreshes resolve. AGN-711.
// ---------------------------------------------------------------------------

async function HnPanel() {
  await refreshHackernewsTrendingFromStore();
  const hn = getHnTopStories(60);
  safeTrigger("hackernews", hnFetchedAt || null);
  const items: ListItem[] = hn.slice(0, 7).map((s) => ({
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
  return (
    <SourceFeedPanel
      source="hn"
      title="HACKER NEWS"
      countLabel={String(hn.length)}
      freshLabel={`updated ${ageLabel(hnFetchedAt)}`}
      footerHref="/hackernews/trending"
      footerLabel={`view all ${hn.length}`}
      feed={{ variant: "list", items }}
    />
  );
}

async function GhPanel() {
  await refreshTrendingFromStore();
  const rows = getTrending("past_24_hours", "All").slice(0, 50);
  const fetchedAt = getLastFetchedAt();
  const items: ListItem[] = rows.slice(0, 7).map((r) => {
    const stars = Number.parseInt(r.stars ?? "0", 10) || 0;
    return {
      id: `gh:${r.repo_id || r.repo_name}`,
      title: r.repo_name,
      href: `/repo/${r.repo_name}`,
      external: false,
      attribution: r.primary_language || "—",
      age: ageLabel(fetchedAt),
      pts: compactNumber(stars),
      chg: r.total_score ? `+${Math.round(Number(r.total_score))}` : null,
      chgDown: false,
    };
  });
  return (
    <SourceFeedPanel
      source="github"
      title="GITHUB · TRENDING"
      countLabel={String(rows.length)}
      freshLabel={`updated ${ageLabel(fetchedAt)}`}
      footerHref="/"
      footerLabel="view trending"
      feed={{ variant: "list", items }}
    />
  );
}

async function XPanel() {
  await refreshTwitterSignalsFromStore();
  const posts = getTopTwitterPosts(20);
  const buzz = getTopTwitterBuzz(20);
  const latestAt = getTwitterLatestUpdatedAt();
  const tweets: TweetItem[] = posts.slice(0, 5).map((t) => ({
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
  const tweetsOrBuzz: TweetItem[] =
    tweets.length > 0
      ? tweets
      : buzz.slice(0, 5).map((b) => ({
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
  return (
    <SourceFeedPanel
      source="x"
      title="X · KOL FEED"
      countLabel={String(posts.length || buzz.length)}
      freshLabel={`updated ${ageLabel(latestAt)}`}
      footerHref="/"
      footerLabel="view all"
      feed={{ variant: "tweet", items: tweetsOrBuzz }}
    />
  );
}

async function RedditPanel() {
  // Reddit data is bundled (no refresh hook); just slice + render.
  const all = getAllRedditPosts();
  safeTrigger("reddit", getRedditFetchedAt());
  const items: ListItem[] = all
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
  return (
    <SourceFeedPanel
      source="reddit"
      title="REDDIT · ML/LLM"
      countLabel={String(all.length)}
      freshLabel={`updated ${ageLabel(getRedditFetchedAt())}`}
      footerHref="/reddit/trending"
      footerLabel={`view all ${all.length}`}
      feed={{ variant: "list", items }}
    />
  );
}

async function BskyPanel() {
  await refreshBlueskyTrendingFromStore();
  const top = getBlueskyTopPosts(60);
  safeTrigger("bluesky", blueskyFetchedAt);
  const items: TweetItem[] = top.slice(0, 5).map((p) => ({
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
  return (
    <SourceFeedPanel
      source="bluesky"
      title="BLUESKY"
      countLabel={String(top.length)}
      freshLabel={`updated ${ageLabel(blueskyFetchedAt)}`}
      footerHref="/bluesky/trending"
      footerLabel="view all"
      feed={{ variant: "tweet", items }}
    />
  );
}

async function DevtoPanel() {
  await refreshDevtoTrendingFromStore();
  const top = getDevtoTopArticles(40);
  safeTrigger("devto", devtoFetchedAt || null);
  const items: RssArticleItem[] = top.slice(0, 4).map((a) => ({
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
  return (
    <SourceFeedPanel
      source="devto"
      title="DEV.TO"
      countLabel={String(top.length)}
      freshLabel={`updated ${ageLabel(devtoFetchedAt)}`}
      footerHref="/devto"
      footerLabel={`view all ${top.length}`}
      feed={{ variant: "rss", items }}
    />
  );
}

async function ClaudePanel() {
  await refreshClaudeRssFromStore();
  const top = getClaudeRssTop(20);
  const items: RssArticleItem[] = top.slice(0, 4).map((a) => ({
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
  return (
    <SourceFeedPanel
      source="claude"
      title="CLAUDE · RSS"
      countLabel={String(top.length)}
      freshLabel={`updated ${ageLabel(claudeFetchedAt())}`}
      footerHref="https://www.anthropic.com/news"
      footerLabel="anthropic.com/news"
      feed={{ variant: "rss", items }}
    />
  );
}

async function OpenaiPanel() {
  await refreshOpenaiRssFromStore();
  const top = getOpenaiRssTop(20);
  const items: RssArticleItem[] = top.slice(0, 4).map((a) => ({
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
  return (
    <SourceFeedPanel
      source="openai"
      title="OPENAI · RSS"
      countLabel={String(top.length)}
      freshLabel={`updated ${ageLabel(openaiFetchedAt())}`}
      footerHref="https://openai.com/news"
      footerLabel="openai.com/news"
      feed={{ variant: "rss", items }}
    />
  );
}

// ---------------------------------------------------------------------------
// Inline panel skeleton — Suspense fallback for each SourceFeedPanel.
// Mirrors the panel chrome (header band + 6 placeholder rows + footer)
// so layout stays stable while the streamed payload resolves.
// ---------------------------------------------------------------------------

function PanelSkeleton({
  title,
  source,
}: {
  title: string;
  source: SourceKey;
}) {
  const tint = SOURCE_BRAND_COLOR[source];
  return (
    <div
      aria-hidden
      className="signals-panel animate-pulse"
      style={{
        border: "1px solid var(--color-border-subtle)",
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: 28,
          padding: "0 10px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderBottom: "1px solid var(--color-border-subtle)",
          background: `color-mix(in srgb, ${tint} 6%, var(--v3-bg-050))`,
          fontSize: 10,
          letterSpacing: "0.20em",
          color: "var(--color-text-subtle)",
          fontFamily: "var(--font-mono)",
          textTransform: "uppercase",
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 2,
            background: `color-mix(in srgb, ${tint} 40%, transparent)`,
          }}
        />
        <span>{title}</span>
      </div>
      <div style={{ padding: 10, display: "grid", gap: 8 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            style={{
              height: 20,
              borderRadius: 2,
              background: "var(--v3-bg-050)",
            }}
          />
        ))}
      </div>
      <div
        style={{
          height: 22,
          borderTop: "1px solid var(--color-border-subtle)",
          background: "var(--v3-bg-050)",
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// SectionHead — replaced by the V4 primitive at @/components/ui/SectionHead
// (same API). Kept as a comment trail so future edits remember this page
// previously had a private inline copy.
// ---------------------------------------------------------------------------

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
