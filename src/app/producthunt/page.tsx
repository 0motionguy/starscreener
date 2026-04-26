// /producthunt — V2 ProductHunt launch terminal.

import { getRecentLaunches } from "@/lib/producthunt";
import { NewsTemplateV2 } from "@/components/today-v2/NewsTemplateV2";
import {
  ADAPTER_SOURCES,
  adaptProductHuntLaunches,
  buildStackedBars,
  buildTopicLines,
  buildTodayCounter,
  pickFeatured,
} from "@/components/today-v2/newsAdapters";

export const dynamic = "force-static";

export const metadata = {
  title: "ProductHunt Signal — TrendingRepo",
  description:
    "Recent ProductHunt launches scored by votes and comments.",
  alternates: { canonical: "/producthunt" },
};

export default function ProductHuntPage() {
  const source = ADAPTER_SOURCES.producthunt;
  // 14-day window, sorted by votes via the adapter.
  const launches = getRecentLaunches(14)
    .slice()
    .sort((a, b) => b.votesCount - a.votesCount);
  const items = adaptProductHuntLaunches(launches, 50);

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
