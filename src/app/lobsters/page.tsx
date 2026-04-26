// /lobsters — V2 Lobsters trending stories.

import { getLobstersTopStories } from "@/lib/lobsters-trending";
import { NewsTemplateV2 } from "@/components/today-v2/NewsTemplateV2";
import {
  ADAPTER_SOURCES,
  adaptLobstersStories,
  buildSourceVolume,
  buildTopTopics,
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
