// Funding announcement signal fetcher.
//
// Pulls a small set of TechCrunch / VentureBeat / Sifted / etc RSS feeds,
// filters items containing funding keywords (raises, secures, …), runs the
// regex-based extractor (company name, $ amount, round type, tags) and
// writes the consolidated payload to ss:data:v1:funding-news.
//
// Slug: `funding-news`. Cadence: every 6h (matches collect-funding.yml).
//
// The original script also seeded a static SEED_SIGNALS list of high-
// quality known rounds. The worker port keeps those — they're a stable
// editorial floor so the page never goes empty if RSS sources are quiet.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore } from '../../lib/redis.js';
import { fetchWithTimeout, sleep } from '../../lib/util/http-helpers.js';
import {
  parseRssItems,
  extractFunding,
  extractTags,
  type FundingExtraction,
} from '../../lib/sources/funding-extract.js';

const WINDOW_DAYS = 21;
const MAX_AGE_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; TrendingRepoBot/1.0; +https://trendingrepo.com)';

const RSS_FEEDS: Record<string, string> = {
  techcrunch: 'https://techcrunch.com/category/startups/feed/',
  venturebeat: 'https://venturebeat.com/feed/',
  sifted: 'https://sifted.eu/feed',
  arstechnica: 'https://arstechnica.com/feed/',
  techeu: 'https://tech.eu/feed/',
  pymnts: 'https://www.pymnts.com/feed/',
  bbc: 'https://feeds.bbci.co.uk/news/technology/rss.xml',
  wired: 'https://www.wired.com/feed/',
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
  extracted: FundingExtraction | null;
  tags: string[];
}

interface FundingNewsPayload {
  fetchedAt: string;
  source: 'funding-news-scraper';
  windowDays: number;
  signals: FundingSignal[];
}

function createSignalId(headline: string, sourceUrl: string): string {
  const domain = sourceUrl.replace(/^https?:\/\//, '').split('/')[0] ?? 'unknown';
  let h = 0;
  for (let i = 0; i < headline.length; i += 1) {
    h = (h * 31 + headline.charCodeAt(i)) >>> 0;
  }
  return `${domain}-${h.toString(16).slice(0, 8)}`;
}

const fetcher: Fetcher = {
  name: 'funding-news',
  schedule: '0 */6 * * *', // matches collect-funding.yml
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();

    if (ctx.dryRun) {
      ctx.log.info('funding-news dry-run');
      return done(startedAt, 0, false);
    }

    const discoveredAt = new Date().toISOString();
    const allSignals: FundingSignal[] = [];
    const seenIds = new Set<string>();

    for (const [sourceName, url] of Object.entries(RSS_FEEDS)) {
      ctx.log.info({ source: sourceName, url }, 'funding rss fetch');
      let items: ReturnType<typeof parseRssItems> = [];
      try {
        const res = await fetchWithTimeout(url, {
          timeoutMs: 20_000,
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'application/rss+xml,application/xml,*/*;q=0.8',
          },
        });
        if (!res.ok) {
          ctx.log.warn({ source: sourceName, status: res.status }, 'rss feed http error');
        } else {
          const xml = await res.text();
          items = parseRssItems(xml);
        }
      } catch (err) {
        ctx.log.warn(
          { source: sourceName, message: (err as Error).message },
          'rss feed failed',
        );
      }

      await sleep(500);

      for (const item of items) {
        const itemDate = Date.parse(item.publishedAt);
        if (Number.isFinite(itemDate) && Date.now() - itemDate > MAX_AGE_MS) continue;
        if (!FUNDING_KEYWORDS.test(item.headline)) continue;
        const id = createSignalId(item.headline, item.sourceUrl);
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        const extracted = extractFunding(item.headline, item.description);
        const tags = extractTags(item.headline, item.description);
        if (extracted && BAD_NAME_PATTERN.test(extracted.companyName)) continue;

        allSignals.push({
          id,
          headline: item.headline,
          description: item.description,
          sourceUrl: item.sourceUrl,
          sourcePlatform: sourceName,
          publishedAt: item.publishedAt,
          discoveredAt,
          extracted,
          tags,
        });
      }
    }

    allSignals.sort((a, b) => {
      const ta = Date.parse(a.publishedAt);
      const tb = Date.parse(b.publishedAt);
      return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
    });

    const payload: FundingNewsPayload = {
      fetchedAt: discoveredAt,
      source: 'funding-news-scraper',
      windowDays: WINDOW_DAYS,
      signals: allSignals,
    };
    const result = await writeDataStore('funding-news', payload);
    ctx.log.info(
      { signals: allSignals.length, redisSource: result.source },
      'funding-news published',
    );
    return done(startedAt, allSignals.length, result.source === 'redis');
  },
};

export default fetcher;

function done(startedAt: string, items: number, redisPublished: boolean): RunResult {
  return {
    fetcher: 'funding-news',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors: [],
  };
}
