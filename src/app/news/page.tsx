// /news — V2 Market Signals (unified cross-source).
//
// Mixes the top items from every news source (HN + Reddit + Bluesky +
// Dev.to + Lobsters + ProductHunt) into one ranked table. Rows carry
// source pills so you can spot at a glance whether a hot signal came
// from HN's front page or a viral Bluesky thread.
//
// Server component. Each source's data lib is read directly; the
// NewsTemplateV2 multi-channel mode handles the stacked-bar legend
// + source-tagged rows.

import { getHnTopStories } from "@/lib/hackernews-trending";
import { getAllHnMentions } from "@/lib/hackernews";
import { getAllRedditPosts } from "@/lib/reddit-data";
import { getBlueskyTopPosts } from "@/lib/bluesky-trending";
import { getAllBlueskyMentions } from "@/lib/bluesky";
import { getDevtoTopArticles } from "@/lib/devto-trending";
import { getLobstersTopStories } from "@/lib/lobsters-trending";
import { getRecentLaunches } from "@/lib/producthunt";

import type { NewsSourceMeta } from "@/components/today-v2/NewsTemplateV2";
import { NewsTemplateV2 } from "@/components/today-v2/NewsTemplateV2";
import {
  ADAPTER_SOURCES,
  adaptHnStories,
  adaptRedditPosts,
  adaptBlueskyPosts,
  adaptDevtoArticles,
  adaptLobstersStories,
  adaptProductHuntLaunches,
  buildStackedBars,
  buildTopicLines,
  buildTodayCounter,
  pickFeatured,
} from "@/components/today-v2/newsAdapters";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Market Signals — TrendingRepo",
  description:
    "Cross-source signal terminal. Every mention from every channel — HN, Reddit, Bluesky, Dev.to, Lobsters, ProductHunt — ranked and merged.",
  alternates: { canonical: "/news" },
};

const PER_SOURCE_LIMIT = 20;

export default function MarketSignalsPage() {
  // Build per-source items, then mix.
  const hnItems = adaptHnStories(
    getHnTopStories(PER_SOURCE_LIMIT),
    getAllHnMentions(),
    PER_SOURCE_LIMIT,
  );
  const redditItems = adaptRedditPosts(
    getAllRedditPosts().slice().sort((a, b) => b.score - a.score),
    PER_SOURCE_LIMIT,
  );
  const bskyItems = adaptBlueskyPosts(
    getBlueskyTopPosts(PER_SOURCE_LIMIT),
    getAllBlueskyMentions(),
    PER_SOURCE_LIMIT,
  );
  const devtoItems = adaptDevtoArticles(
    getDevtoTopArticles(PER_SOURCE_LIMIT),
    PER_SOURCE_LIMIT,
  );
  const lobItems = adaptLobstersStories(
    getLobstersTopStories(PER_SOURCE_LIMIT),
    PER_SOURCE_LIMIT,
  );
  const phItems = adaptProductHuntLaunches(
    getRecentLaunches(14)
      .slice()
      .sort((a, b) => b.votesCount - a.votesCount),
    PER_SOURCE_LIMIT,
  );

  // Merge + sort by score (heat-tier ordering keeps breakouts on top).
  const items = [
    ...hnItems,
    ...redditItems,
    ...bskyItems,
    ...devtoItems,
    ...lobItems,
    ...phItems,
  ].sort((a, b) => b.score - a.score);

  const channels: NewsSourceMeta[] = [
    ADAPTER_SOURCES.hackernews,
    ADAPTER_SOURCES.reddit,
    ADAPTER_SOURCES.bluesky,
    ADAPTER_SOURCES.devto,
    ADAPTER_SOURCES.lobsters,
    ADAPTER_SOURCES.producthunt,
  ];

  // Hero charts use per-channel item buckets so the stacked bar reads
  // as "channel mix" instead of one big total.
  const itemsByChannel: Record<string, typeof items> = {
    HN: hnItems,
    R: redditItems,
    B: bskyItems,
    D: devtoItems,
    L: lobItems,
    PH: phItems,
  };

  const stackedBars = buildStackedBars(channels, itemsByChannel);
  const topicLines = buildTopicLines(items);
  const counter = buildTodayCounter(stackedBars);

  // Featured cards mix sources too — pick top 3 by score from the
  // merged feed.
  const unifiedSource: NewsSourceMeta = {
    code: "ALL",
    label: "ALL",
    color: "rgba(146, 151, 246, 0.85)",
    slug: "news",
  };
  const featured = pickFeatured(items.slice(0, 3), unifiedSource);

  return (
    <NewsTemplateV2
      source={unifiedSource}
      channels={channels}
      items={items.slice(0, 60)}
      todayCounter={counter.total}
      todayDelta={counter.delta}
      stackedBars={stackedBars}
      topicLines={topicLines}
      featured={featured}
    />
  );
}
