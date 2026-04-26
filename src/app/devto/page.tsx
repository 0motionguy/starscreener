// /devto — V2 Dev.to long-form signal terminal.

import { getDevtoTopArticles } from "@/lib/devto-trending";
import { NewsTemplateV2 } from "@/components/today-v2/NewsTemplateV2";
import {
  ADAPTER_SOURCES,
  adaptDevtoArticles,
  buildStackedBars,
  buildTopicLines,
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

export default function DevtoPage() {
  const source = ADAPTER_SOURCES.devto;
  const articles = getDevtoTopArticles(50);
  const items = adaptDevtoArticles(articles, 50);

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
