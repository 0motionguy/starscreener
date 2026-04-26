// StarScreener — /feeds/funding.xml
//
// RSS 2.0 feed of the 30 most recent funding signals ingested from
// TechCrunch / VentureBeat / Sifted / YC / NewsAPI etc. Each <item> links
// back to the source article — this feed syndicates headlines, not
// landing pages, because each signal is a public news event.

import {
  getFundingSignals,
  refreshFundingNewsFromStore,
} from "@/lib/funding-news";
import type { FundingSignal } from "@/lib/funding/types";
import { renderRssFeed, type RssItem } from "@/lib/feeds/rss";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

export const revalidate = 1800; // 30 minutes

const MAX_ITEMS = 30;

function signalTitle(signal: FundingSignal): string {
  const ex = signal.extracted;
  if (ex && ex.amountDisplay && ex.companyName) {
    return `${ex.amountDisplay} raised by ${ex.companyName}`;
  }
  return signal.headline;
}

function signalDescription(signal: FundingSignal): string {
  const ex = signal.extracted;
  const parts: string[] = [];
  if (ex) {
    const meta: string[] = [];
    if (ex.roundType && ex.roundType !== "undisclosed") meta.push(ex.roundType);
    if (ex.amountDisplay) meta.push(ex.amountDisplay);
    if (ex.investors && ex.investors.length > 0) {
      meta.push(`Led by ${ex.investors.slice(0, 3).join(", ")}`);
    }
    if (meta.length > 0) {
      parts.push(`<p><strong>${meta.join(" · ")}</strong></p>`);
    }
  }
  if (signal.description && signal.description.trim().length > 0) {
    parts.push(`<p>${signal.description}</p>`);
  }
  parts.push(
    `<p><em>Source: ${signal.sourcePlatform}</em></p>`,
  );
  return parts.join("\n");
}

function byPublishedDesc(a: FundingSignal, b: FundingSignal): number {
  const ta = Date.parse(a.publishedAt);
  const tb = Date.parse(b.publishedAt);
  const na = Number.isFinite(ta) ? ta : 0;
  const nb = Number.isFinite(tb) ? tb : 0;
  return nb - na;
}

export async function GET(): Promise<Response> {
  await refreshFundingNewsFromStore();
  const signals = getFundingSignals();
  const ordered = [...signals].sort(byPublishedDesc).slice(0, MAX_ITEMS);

  const items: RssItem[] = ordered.map((signal) => {
    const link = signal.sourceUrl || absoluteUrl("/funding");
    return {
      title: signalTitle(signal),
      link,
      guid: signal.id || link,
      pubDate: signal.publishedAt,
      description: signalDescription(signal),
      author: signal.sourcePlatform,
      categories: signal.tags,
    };
  });

  const feedLink = absoluteUrl("/feeds/funding.xml");
  const xml = renderRssFeed({
    title: `${SITE_NAME} — Funding Radar`,
    link: feedLink,
    description:
      "Fresh AI + startup funding announcements tracked from TechCrunch, VentureBeat, Sifted, Y Combinator and more.",
    lastBuildDate: new Date().toISOString(),
    items,
  });

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
    },
  });
}
