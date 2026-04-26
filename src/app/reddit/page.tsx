// /reddit — V2 Reddit signal terminal.

import { getAllRedditPosts } from "@/lib/reddit-data";
import { NewsTemplateV2 } from "@/components/today-v2/NewsTemplateV2";
import {
  ADAPTER_SOURCES,
  adaptRedditPosts,
  buildStackedBars,
  buildTopicLines,
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
