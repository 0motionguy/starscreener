// /reddit — V2 Reddit signal terminal.

import { getAllRedditPosts } from "@/lib/reddit-data";
import { NewsTemplateV2 } from "@/components/today-v2/NewsTemplateV2";
import {
  ADAPTER_SOURCES,
  adaptRedditPosts,
  buildSourceVolume,
  buildTopTopics,
  buildTodayCounter,
  pickFeatured,
} from "@/components/today-v2/newsAdapters";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Reddit Signal — TrendingRepo",
  description:
    "Top Reddit posts mentioning tracked repos, scored by upvote velocity and comment volume.",
  alternates: { canonical: "/reddit" },
};

export default function RedditPage() {
  const source = ADAPTER_SOURCES.reddit;
  const posts = getAllRedditPosts().sort((a, b) => b.score - a.score);
  const items = adaptRedditPosts(posts, 50);

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
