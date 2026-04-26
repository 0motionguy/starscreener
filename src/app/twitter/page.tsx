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
  buildSourceVolume,
  buildTopTopics,
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
  const sourceVolume = buildSourceVolume(channels, itemsByChannel);
  const topTopics = buildTopTopics(items);
  const counter = buildTodayCounter(items);
  const featured = pickFeatured(items, source);

  return (
    <NewsTemplateV2
      source={source}
      channels={channels}
      items={items}
      totalItems={counter.totalItems}
      totalScore={counter.totalScore}
      topItem={counter.topItem}
      sourceVolume={sourceVolume}
      topTopics={topTopics}
      featured={featured}
    />
  );
}
