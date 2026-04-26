// /lobsters — V2 Lobsters trending stories.

import { getLobstersTopStories } from "@/lib/lobsters-trending";
import { NewsTemplateV2 } from "@/components/today-v2/NewsTemplateV2";
import {
  ADAPTER_SOURCES,
  adaptLobstersStories,
  buildStackedBars,
  buildTopicLines,
  buildTodayCounter,
  pickFeatured,
} from "@/components/today-v2/newsAdapters";

export const dynamic = "force-static";

export const metadata = {
  title: "Lobsters Signal — TrendingRepo",
  description:
    "Top Lobsters stories scored by velocity × upvotes × comments.",
  alternates: { canonical: "/lobsters" },
};

export default function LobstersPage() {
  const source = ADAPTER_SOURCES.lobsters;
  const stories = getLobstersTopStories(50);
  const items = adaptLobstersStories(stories, 50);

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
