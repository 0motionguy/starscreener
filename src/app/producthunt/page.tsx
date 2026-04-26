// /producthunt — V2 ProductHunt launch terminal.

import { getRecentLaunches } from "@/lib/producthunt";
import { NewsTemplateV2 } from "@/components/today-v2/NewsTemplateV2";
import {
  ADAPTER_SOURCES,
  adaptProductHuntLaunches,
  buildSourceVolume,
  buildTopTopics,
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
