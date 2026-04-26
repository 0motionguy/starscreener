// /bluesky/trending — V2 Bluesky engagement-ranked feed.

import { getBlueskyTopPosts } from "@/lib/bluesky-trending";
import { getAllBlueskyMentions } from "@/lib/bluesky";
import { NewsTemplateV2 } from "@/components/today-v2/NewsTemplateV2";
import {
  ADAPTER_SOURCES,
  adaptBlueskyPosts,
  buildSourceVolume,
  buildTopTopics,
  buildTodayCounter,
  pickFeatured,
} from "@/components/today-v2/newsAdapters";

export const dynamic = "force-static";

export const metadata = {
  title: "Bluesky Signal — TrendingRepo",
  description:
    "Engagement-ranked Bluesky posts mentioning tracked GitHub repos.",
  alternates: { canonical: "/bluesky/trending" },
};

export default function BlueskyTrendingPage() {
  const source = ADAPTER_SOURCES.bluesky;
  const posts = getBlueskyTopPosts(50);
  const items = adaptBlueskyPosts(posts, getAllBlueskyMentions(), 50);

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
