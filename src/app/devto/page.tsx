// /devto — V2 Dev.to long-form signal terminal.

import {
  getDevtoTopArticles,
  refreshDevtoTrendingFromStore,
} from "@/lib/devto-trending";
import { refreshDevtoMentionsFromStore } from "@/lib/devto";
import { NewsTemplateV2 } from "@/components/today-v2/NewsTemplateV2";
import {
  ADAPTER_SOURCES,
  adaptDevtoArticles,
  buildSourceVolume,
  buildTopTopics,
  buildTodayCounter,
  pickFeatured,
} from "@/components/today-v2/newsAdapters";

export const dynamic = "force-static";

export const metadata = {
  title: "Dev.to Signal — TrendingRepo",
  description:
    "Top long-form developer articles linking to tracked GitHub repos.",
  alternates: { canonical: "/devto" },
};

export default async function DevtoPage() {
  await Promise.all([
    refreshDevtoTrendingFromStore(),
    refreshDevtoMentionsFromStore(),
  ]);
  const source = ADAPTER_SOURCES.devto;
  const articles = getDevtoTopArticles(50);
  const items = adaptDevtoArticles(articles, 50);

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
