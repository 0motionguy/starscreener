#!/usr/bin/env tsx

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { fetchWithTimeout, sleep } from "./_fetch-json.mjs";
import { writeDataStore, closeDataStore } from "./_data-store-write.mjs";
import { writeSourceMetaFromOutcome } from "./_data-meta.mjs";
import {
  extractFunding,
  extractTags,
  parseRssItems,
} from "./scrape-funding-news.mjs";

const DATA_DIR = resolve(process.cwd(), "data");
const OUT_PATH = resolve(DATA_DIR, "funding-news-crunchbase.json");
const WINDOW_DAYS = 21;
const MAX_AGE_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; TrendingRepoBot/1.0; +https://trendingrepo.com)";

const CRUNCHBASE_FEEDS: Record<string, string> = {
  crunchbase: "https://news.crunchbase.com/feed/",
  "crunchbase-venture": "https://news.crunchbase.com/sections/venture/feed/",
  techfundingnews: "https://techfundingnews.com/feed/",
  alleywatch: "https://www.alleywatch.com/feed/",
  finsmes: "https://www.finsmes.com/feed",
  "crunchbase-startups": "https://news.crunchbase.com/sections/startups/feed/",
};

const FUNDING_KEYWORDS =
  /\braises?\b|\braised\b|\bsecures?\b|\bsecured\b|\bfunding\b|\binvestment\b|\bround\b|\bmillion\b|\bbillion\b|\bacquired\b|\bacquisition\b/i;

const BAD_NAME_PATTERN =
  /^(the\s|fintech\b|sources\b|report\b|breaking\b|scoop\b|ai\s+startups|billionaire|cathie\s+wood|creandum\s+partner|alumni\b)/i;

interface FundingSignal {
  id: string;
  headline: string;
  description: string;
  sourceUrl: string;
  sourcePlatform: string;
  publishedAt: string;
  discoveredAt: string;
  extracted: ReturnType<typeof extractFunding>;
  tags: string[];
}

function createSignalId(headline: string, sourceUrl: string): string {
  const domain = sourceUrl.replace(/^https?:\/\//, "").split("/")[0] ?? "unknown";
  let h = 0;
  for (let i = 0; i < headline.length; i += 1) {
    h = (h * 31 + headline.charCodeAt(i)) >>> 0;
  }
  return `${domain}-${h.toString(16).slice(0, 8)}`;
}

async function fetchRssFeed(url: string, sourceName: string) {
  let lastError: string | null = null;
  for (let attempt = 0; attempt <= 1; attempt += 1) {
    try {
      // fetchWithTimeout doesn't expose `headers` in its options shape; pass
      // headers via a wrapping fetchImpl so the request still emits them.
      const res = await fetchWithTimeout(url, {
        timeoutMs: 20_000,
        fetchImpl: (input, init) =>
          fetch(input, {
            ...init,
            headers: {
              "User-Agent": USER_AGENT,
              Accept: "application/rss+xml,application/xml,*/*;q=0.8",
              ...(init?.headers ?? {}),
            },
          }),
      });
      if (!res.ok) {
        lastError = `http ${res.status}`;
        if (res.status < 500 || attempt === 1) break;
        await sleep(1_500);
        continue;
      }
      const xml = await res.text();
      return parseRssItems(xml, url);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === 1) break;
      await sleep(1_500);
    }
  }
  console.warn(`[funding-crunchbase] ${sourceName} failed: ${lastError ?? "unknown"}`);
  return [];
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const discoveredAt = new Date().toISOString();
  const nowMs = Date.now();

  const allSignals: FundingSignal[] = [];
  const seenIds = new Set<string>();
  let partialFailures = 0;

  for (const [sourceName, url] of Object.entries(CRUNCHBASE_FEEDS)) {
    const items = await fetchRssFeed(url, sourceName);
    if (items.length === 0) partialFailures += 1;
    await sleep(500);

    for (const item of items) {
      const itemDate = Date.parse(item.publishedAt);
      if (Number.isFinite(itemDate) && nowMs - itemDate > MAX_AGE_MS) continue;
      if (!FUNDING_KEYWORDS.test(item.headline)) continue;

      const extracted = extractFunding(item.headline, item.description);
      if (extracted && BAD_NAME_PATTERN.test(extracted.companyName)) continue;

      const id = createSignalId(item.headline, item.sourceUrl);
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      allSignals.push({
        id,
        headline: item.headline,
        description: item.description,
        sourceUrl: item.sourceUrl,
        sourcePlatform: sourceName,
        publishedAt: item.publishedAt,
        discoveredAt,
        extracted,
        tags: extractTags(item.headline, item.description),
      });
    }
  }

  allSignals.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

  const payload = {
    fetchedAt: discoveredAt,
    source: "crunchbase-rss",
    windowDays: WINDOW_DAYS,
    signals: allSignals,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  const redisResult = await writeDataStore("funding-news-crunchbase", payload);
  console.log(
    `[funding-crunchbase] wrote ${allSignals.length} signals to ${OUT_PATH} [redis: ${redisResult.source}]`,
  );
  await writeSourceMetaFromOutcome({
    source: "funding-crunchbase",
    count: allSignals.length,
    durationMs: Date.now() - startedAt,
    error: null,
    partialFailures,
    extra: { feeds: Object.keys(CRUNCHBASE_FEEDS).length },
  });
}

const startedAt = Date.now();
main()
  .catch(async (error) => {
    await writeSourceMetaFromOutcome({
      source: "funding-crunchbase",
      count: 0,
      durationMs: Date.now() - startedAt,
      error,
      extra: { feeds: Object.keys(CRUNCHBASE_FEEDS).length },
    });
    throw error;
  })
  .finally(async () => {
    await closeDataStore();
  });
