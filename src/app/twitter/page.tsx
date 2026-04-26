// /twitter — V2 Twitter/X repo leaderboard.
//
// Different shape from the other news sources: this is a leaderboard
// of REPOS ranked by Twitter mention volume, not a feed of tweets.
// Each row in the table represents a tracked repo; the "title" is the
// repo's full name, the "score" is its Twitter signal, "mentions" is
// the 24h mention count.

import type { Metadata } from "next";

import { getTwitterLeaderboard } from "@/lib/twitter/service";
import { NewsTemplateV2 } from "@/components/today-v2/NewsTemplateV2";
import {
  ADAPTER_SOURCES,
  adaptTwitterLeaderboard,
  buildStackedBars,
  buildTopicLines,
  buildTodayCounter,
  pickFeatured,
} from "@/components/today-v2/newsAdapters";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trending Repos on X — TrendingRepo",
  description:
    "TrendingRepo-ranked repositories with real X/Twitter mentions in the last 24 hours.",
  alternates: { canonical: "/twitter" },
};

export default async function TwitterPage() {
  const source = ADAPTER_SOURCES.twitter;
  const rows = await getTwitterLeaderboard(50);
  const items = adaptTwitterLeaderboard(rows, 50);

  const channels = [source];
  const itemsByChannel = { [source.code]: items };
  const stackedBars = buildStackedBars(channels, itemsByChannel);
  const topicLines = buildTopicLines(items);
  const counter = buildTodayCounter(stackedBars);
  const featured = pickFeatured(items, source);

  return (
    <NewsTemplateV2
      source={source}
      channels={channels}
      items={items}
      todayCounter={counter.total}
      todayDelta={counter.delta}
      stackedBars={stackedBars}
      topicLines={topicLines}
      featured={featured}
    />
  );
}
