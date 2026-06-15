// TrendingRepo — /feeds (JSON index of RSS feeds)
//
// Lists every RSS feed TrendingRepo publishes, both the curated cross-cut
// surfaces (breakouts, funding, agent-commerce) and one per CATEGORIES axis
// (the 32-axis taxonomy — companion to PR #3185's classifier). Useful for
// agents discovering the feed surface programmatically — they hit `/feeds`
// once and learn about every per-category RSS URL without scraping
// `<link rel="alternate">` tags off the category pages.
//
// This is the "agent-discoverable index" half of the per-category RSS PR.
// `/llms.txt` cites it as the canonical feed listing.

import { NextResponse } from "next/server";
import { CATEGORIES } from "@/lib/constants";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

export const runtime = "nodejs";

const CURATED_FEEDS = [
  {
    id: "breakouts",
    title: "Cross-Signal Breakouts",
    description:
      "Top open-source repos firing across multiple signals (GitHub momentum + Reddit + Hacker News).",
    feed: "/feeds/breakouts.xml",
    page: "/breakouts",
  },
  {
    id: "funding",
    title: "Funding Signals",
    description:
      "Most recent VC funding signals ingested from TechCrunch, VentureBeat, Sifted, YC, and partner feeds.",
    feed: "/feeds/funding.xml",
    page: "/funding",
  },
  {
    id: "agent-commerce",
    title: "Agent-Commerce Index",
    description:
      "Repos shipping agent-commerce primitives (x402, payment-gated MCPs, agent-callable APIs).",
    feed: "/feeds/agent-commerce.xml",
    page: "/agent-commerce",
  },
] as const;

export function GET(): NextResponse {
  const categoryFeeds = CATEGORIES.map((c) => ({
    id: c.id,
    title: `${SITE_NAME} — ${c.name}`,
    description: c.description,
    feed: absoluteUrl(`/feeds/${c.id}.xml`),
    page: absoluteUrl(`/categories/${c.id}`),
  }));

  const curatedFeeds = CURATED_FEEDS.map((f) => ({
    id: f.id,
    title: `${SITE_NAME} — ${f.title}`,
    description: f.description,
    feed: absoluteUrl(f.feed),
    page: absoluteUrl(f.page),
  }));

  const body = {
    name: `${SITE_NAME} feed index`,
    description:
      "Every RSS 2.0 feed published by TrendingRepo. Curated cross-cuts plus one feed per category axis. Each feed updates every 15 minutes with up to 25 items.",
    contentType: "application/rss+xml",
    refreshIntervalSeconds: 900,
    maxItemsPerFeed: 25,
    feeds: {
      curated: curatedFeeds,
      categories: categoryFeeds,
    },
    counts: {
      curated: curatedFeeds.length,
      categories: categoryFeeds.length,
      total: curatedFeeds.length + categoryFeeds.length,
    },
    docs: absoluteUrl("/docs/api"),
  };

  return NextResponse.json(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
