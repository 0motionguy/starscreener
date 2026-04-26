// /hackernews/trending — V2 news terminal.
//
// Velocity-scored HN feed. Uses the V2 NewsTemplate so this page is
// visually identical to every other source page — same hero (counter +
// 2 trend charts) + 3 featured cards + table.

import { getHnTopStories } from "@/lib/hackernews-trending";
import { getAllHnMentions } from "@/lib/hackernews";
import { NewsTemplateV2 } from "@/components/today-v2/NewsTemplateV2";
import {
  ADAPTER_SOURCES,
  adaptHnStories,
  buildStackedBars,
  buildTopicLines,
  buildTodayCounter,
  pickFeatured,
} from "@/components/today-v2/newsAdapters";

export const dynamic = "force-static";

export const metadata = {
  title: "HackerNews Trending — TrendingRepo",
  description:
    "Velocity-scored HN stories. Firebase top 500 + Algolia 7d GitHub-mention sweep, deduped and scored by velocity × log10(score).",
  alternates: { canonical: "/hackernews/trending" },
};

export default function HackerNewsTrendingPage() {
  const source = ADAPTER_SOURCES.hackernews;
  const stories = getHnTopStories(50);
  const items = adaptHnStories(stories, getAllHnMentions(), 50);

  // Single-source page — channels = just HN.
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
