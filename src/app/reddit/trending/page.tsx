// /reddit/trending — V2 Reddit-wide trending posts.
//
// Uses the broader reddit-all dataset (every scanned subreddit, not
// just the repo-mention slice) so the feed shows what the whole
// developer Reddit is talking about, scored by upvote velocity.

import { getAllScoredPosts } from "@/lib/reddit-all-data";
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
  title: "Reddit Trending — TrendingRepo",
  description:
    "All-Reddit trending feed across every scanned subreddit, scored by upvote velocity.",
  alternates: { canonical: "/reddit/trending" },
};

export default function RedditTrendingPage() {
  const source = ADAPTER_SOURCES.reddit;
  const posts = getAllScoredPosts().sort((a, b) => b.score - a.score);
  const items = adaptRedditPosts(posts, 60);

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
