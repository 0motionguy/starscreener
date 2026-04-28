// Crunchbase / venture-tag RSS funding fetcher.
//
// Layers an additional 4-6 funding-specific RSS feeds on top of the main
// `funding-news` fetcher to widen Phase 3.4 source coverage. Output mirrors
// the FundingSignal shape produced by `funding-news/index.ts` so the consumer
// (`src/lib/funding-news.ts` + `src/lib/funding/repo-events.ts`) can merge
// the three slugs (funding-news / funding-news-crunchbase / funding-news-x)
// trivially — same fields, same id derivation, same date filtering rules.
//
// Slug: `funding-news-crunchbase`. Cadence: every 6h, offset to :00 to avoid
// clustering with the main funding-news fetcher (which runs at `0 */6 * * *`
// too) AND with reddit (:30) / trustmrr (:27) on the same hour. Both 6h
// fetchers running simultaneously is fine — Redis writes are < 1s and the
// upstream RSS hosts are independent.
//
// Reliability: per-feed one retry on network/5xx (4xx skipped — permanent),
// per-feed failures logged but don't blank the slug. Window matches main
// funding-news (21 days) so the consumer's downstream filtering is consistent.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore } from '../../lib/redis.js';
import { fetchWithTimeout, sleep } from '../../lib/util/http-helpers.js';
import {
  parseRssItems,
  extractFunding,
  extractTags,
  type FundingExtraction,
} from '../../lib/sources/funding-extract.js';
import { CRUNCHBASE_FEEDS } from './feeds.js';

const WINDOW_DAYS = 21;
const MAX_AGE_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; TrendingRepoBot/1.0; +https://trendingrepo.com)';

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

export interface FundingNewsCrunchbasePayload {
  fetchedAt: string;
  source: 'crunchbase-rss';
  windowDays: number;
  signals: FundingSignal[];
}

/**
 * Build a stable id matching the convention used by funding-news/index.ts so
 * the consumer can dedupe across slugs without a special case. Hash space is
 * 32-bit; collisions are negligible at our volume (~hundreds of signals).
 */
export function createSignalId(headline: string, sourceUrl: string): string {
  const domain = sourceUrl.replace(/^https?:\/\//, '').split('/')[0] ?? 'unknown';
  let h = 0;
  for (let i = 0; i < headline.length; i += 1) {
    h = (h * 31 + headline.charCodeAt(i)) >>> 0;
  }
  return `${domain}-${h.toString(16).slice(0, 8)}`;
}

/**
 * Pure-function transform — RSS-parsed items into FundingSignal[]. Exported
 * so the parser test can exercise it without spinning up the network layer.
 */
export function buildSignalsFromItems(
  items: ReturnType<typeof parseRssItems>,
  sourceName: string,
  discoveredAt: string,
  now: number = Date.now(),
): FundingSignal[] {
  const out: FundingSignal[] = [];
  for (const item of items) {
    const itemDate = Date.parse(item.publishedAt);
    if (Number.isFinite(itemDate) && now - itemDate > MAX_AGE_MS) continue;
    if (!FUNDING_KEYWORDS.test(item.headline)) continue;

    const extracted = extractFunding(item.headline, item.description);
    const tags = extractTags(item.headline, item.description);
    if (extracted && BAD_NAME_PATTERN.test(extracted.companyName)) continue;

    out.push({
      id: createSignalId(item.headline, item.sourceUrl),
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
  return out;
}

const fetcher: Fetcher = {
  name: 'crunchbase',
  // Every 6h on the hour. Matches the main funding-news cadence; both feeds
  // produce independent slugs so concurrent runs are safe.
  schedule: '0 */6 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();

    if (ctx.dryRun) {
      ctx.log.info(
        { feeds: Object.keys(CRUNCHBASE_FEEDS).length },
        'crunchbase dry-run',
      );
      return done(startedAt, 0, false);
    }

    const discoveredAt = new Date().toISOString();
    const allSignals: FundingSignal[] = [];
    const seenIds = new Set<string>();

    for (const [sourceName, url] of Object.entries(CRUNCHBASE_FEEDS)) {
      ctx.log.info({ source: sourceName, url }, 'crunchbase rss fetch');

      let items: ReturnType<typeof parseRssItems> = [];
      let lastError: string | null = null;

      // One retry on network / 5xx — RSS sources flake intermittently and
      // matches the resilience pattern in funding-news/index.ts.
      for (let attempt = 0; attempt <= 1; attempt += 1) {
        try {
          const res = await fetchWithTimeout(url, {
            timeoutMs: 20_000,
            headers: {
              'User-Agent': USER_AGENT,
              Accept: 'application/rss+xml,application/xml,*/*;q=0.8',
            },
          });
          if (!res.ok) {
            lastError = `http ${res.status}`;
            // 4xx is permanent; only retry 5xx.
            if (res.status < 500 || attempt === 1) break;
            await sleep(1500);
            continue;
          }
          const xml = await res.text();
          items = parseRssItems(xml);
          lastError = null;
          break;
        } catch (err) {
          lastError = (err as Error).message;
          if (attempt === 1) break;
          await sleep(1500);
        }
      }
      if (lastError) {
        ctx.log.warn(
          { source: sourceName, error: lastError },
          'crunchbase rss feed failed after retry',
        );
      }

      // Per-feed pause to be a polite scraper.
      await sleep(500);

      const signals = buildSignalsFromItems(items, sourceName, discoveredAt);
      for (const signal of signals) {
        if (seenIds.has(signal.id)) continue;
        seenIds.add(signal.id);
        allSignals.push(signal);
      }
    }

    allSignals.sort((a, b) => {
      const ta = Date.parse(a.publishedAt);
      const tb = Date.parse(b.publishedAt);
      return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
    });

    const payload: FundingNewsCrunchbasePayload = {
      fetchedAt: discoveredAt,
      source: 'crunchbase-rss',
      windowDays: WINDOW_DAYS,
      signals: allSignals,
    };
    const result = await writeDataStore('funding-news-crunchbase', payload);
    ctx.log.info(
      { signals: allSignals.length, redisSource: result.source },
      'funding-news-crunchbase published',
    );
    return done(startedAt, allSignals.length, result.source === 'redis');
  },
};

export default fetcher;

function done(startedAt: string, items: number, redisPublished: boolean): RunResult {
  return {
    fetcher: 'crunchbase',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors: [],
  };
}
