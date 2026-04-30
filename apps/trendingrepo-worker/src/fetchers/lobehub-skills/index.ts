// LobeHub Skills Marketplace fetcher.
//
// LobeHub does not expose a public JSON API for /skills - the page is
// Next.js-rendered. We pull via Firecrawl markdown render (waitFor=10s
// to let their hydration finish), then regex out skill rows using the
// link/install-count pattern we observe.
//
// 288K+ skills indexed (per the homepage banner).
//
// Cron: 45 */12 * * *  (every 12h at :45, staggered from skills-sh / skillsmp / smithery-skills)
// Output: ss:data:v1:trending-skill-lobehub

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore } from '../../lib/redis.js';
import { loadEnv } from '../../lib/env.js';

const PAGE_URL = 'https://lobehub.com/skills';
const FIRECRAWL_BASE = 'https://api.firecrawl.dev';
const WAIT_MS = 10_000;
// Sprint bump: 200→1000 keep. The Firecrawl path can yield ~1000 rows
// with waitFor=10s, so the prior cap was the bottleneck not the upstream.
const TOP_KEEP = 1000;
const RECENCY_HALF_LIFE_DAYS = 30;

interface FirecrawlScrapeResponse {
  success: boolean;
  data?: {
    markdown?: string;
    metadata?: { title?: string; statusCode?: number };
  };
}

interface SkillRow {
  rank: number;
  source_id: string;
  title: string;
  url: string;
  installs: number | null;
  stars: number | null;
  trending_score: number;
}

interface LobehubPayload {
  fetchedAt: string;
  windowItems: number;
  total_seen: number;
  items: SkillRow[];
}

const fetcher: Fetcher = {
  name: 'lobehub-skills',
  schedule: '45 */12 * * *',
  // Phase-5 escalation 2026-04-29: dropped `requiresFirecrawl: true` (the
  // shared runner short-circuits on that flag without the key, leaving the
  // page empty). When FIRECRAWL_API_KEY is set we still prefer Firecrawl
  // (richer hydrated payload, ~200 items); otherwise we fall back to direct
  // HTTP and parse the SSR'd HTML for ~30-50 items. Same Q2 pattern that
  // unblocked skills-sh in commit eacb5ce2.
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('lobehub-skills dry-run');
      return done(startedAt, 0, false);
    }
    const env = loadEnv();

    const errors: RunResult['errors'] = [];
    let rows: ParsedRow[] = [];
    let mode: 'firecrawl' | 'direct' = 'direct';

    if (env.FIRECRAWL_API_KEY) {
      mode = 'firecrawl';
      try {
        const { data } = await ctx.http.json<FirecrawlScrapeResponse>(`${FIRECRAWL_BASE}/v1/scrape`, {
          method: 'POST',
          headers: { authorization: `Bearer ${env.FIRECRAWL_API_KEY}`, 'content-type': 'application/json' },
          body: { url: PAGE_URL, formats: ['markdown'], waitFor: WAIT_MS, onlyMainContent: true },
          timeoutMs: 60_000,
          maxRetries: 2,
          useEtagCache: false,
        });
        rows = parseLobehubMarkdown(data?.data?.markdown ?? '');
      } catch (err) {
        errors.push({ stage: 'firecrawl', message: (err as Error).message });
      }
    }

    // Direct-HTTP fallback: triggered when Firecrawl is absent OR when its
    // call errored / returned zero rows. lobehub.com SSRs ~30-50 skill rows
    // straight into the HTML — fewer than the post-hydration Firecrawl
    // payload, but better than the zero rows the prior gate produced.
    if (rows.length === 0) {
      try {
        // ctx.http.text returns { data, cached } since the HTTP-cache wave;
        // parseLobehubHtml only wants the body string.
        const { data: html } = await ctx.http.text(PAGE_URL, {
          timeoutMs: 30_000,
          useEtagCache: false,
          headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/120.0' },
        });
        rows = parseLobehubHtml(html);
        if (mode === 'firecrawl' && rows.length > 0) mode = 'direct';
      } catch (err) {
        errors.push({ stage: 'direct-http', message: (err as Error).message });
      }
    }
    const ranked = rows
      .map(scoreRow)
      .sort((a, b) => b.trending_score - a.trending_score)
      .slice(0, TOP_KEEP)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    const payload: LobehubPayload = {
      fetchedAt: new Date().toISOString(),
      windowItems: ranked.length,
      total_seen: rows.length,
      items: ranked,
    };

    const result = await writeDataStore('trending-skill-lobehub', payload);
    ctx.log.info(
      { mode, items: ranked.length, totalSeen: rows.length, redisSource: result.source, writtenAt: result.writtenAt, errors: errors.length },
      'lobehub-skills published',
    );

    return {
      fetcher: 'lobehub-skills',
      startedAt,
      finishedAt: new Date().toISOString(),
      itemsSeen: rows.length,
      itemsUpserted: 0,
      metricsWritten: 0,
      redisPublished: result.source === 'redis',
      errors,
    };
  },
};

export default fetcher;

interface ParsedRow {
  source_id: string;
  title: string;
  url: string;
  installs: number | null;
  stars: number | null;
}

const LH_LINK_RE = /\[([^\]]+)\]\(https:\/\/lobehub\.com\/skills\/([^)\s#?]+)\)/g;
const NUMERIC_NEAR_RE = /(\d+(?:\.\d+)?[KMB]?)/g;

/**
 * Parse a LobeHub /skills markdown rendering. The page renders each skill
 * as a markdown link `[title](https://lobehub.com/skills/<owner>/<slug>)`
 * with install/star numbers nearby. Numbers don't have stable labels in
 * the markdown view, so we capture the FIRST K/M-suffixed number after
 * each link as a popularity proxy and call it `installs`.
 */
export function parseLobehubMarkdown(markdown: string): ParsedRow[] {
  const out: ParsedRow[] = [];
  const seen = new Set<string>();
  for (const match of markdown.matchAll(LH_LINK_RE)) {
    const title = (match[1] ?? '').trim();
    const path = (match[2] ?? '').trim();
    if (!title || !path) continue;
    const sourceId = path;
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);

    // Look in a window 200 chars after the match for a numeric badge.
    const windowEnd = Math.min(markdown.length, (match.index ?? 0) + match[0].length + 200);
    const windowSlice = markdown.slice(match.index ?? 0, windowEnd);
    let installs: number | null = null;
    for (const numMatch of windowSlice.matchAll(NUMERIC_NEAR_RE)) {
      const parsed = parseShortNumber(numMatch[1] ?? '');
      if (parsed !== null && parsed > 0) {
        installs = parsed;
        break;
      }
    }

    out.push({
      source_id: sourceId,
      title: title.slice(0, 200),
      url: `https://lobehub.com/skills/${sourceId}`,
      installs,
      stars: null,
    });
  }
  return out;
}

/**
 * Parse the raw SSR'd HTML from lobehub.com/skills. Direct-HTTP fallback
 * when FIRECRAWL_API_KEY is absent. lobehub uses Next.js App Router so
 * there's no `__NEXT_DATA__` blob — instead the HTML carries skill paths
 * as anchor `href`s and install counts as `installCount":<N>` JSON
 * fragments embedded in RSC flight payloads. We pair each path with the
 * first install count appearing within ~600 chars after it.
 */
const HREF_RE = /href="\/skills\/([a-z0-9_-]+\/[a-z0-9_-]+)"/gi;
const INSTALL_RE = /"installCount":(\d+)/g;

export function parseLobehubHtml(html: string): ParsedRow[] {
  if (!html) return [];
  const out: ParsedRow[] = [];
  const seen = new Set<string>();
  // Build a sorted index of installCount positions so each path can pick
  // the nearest-following count.
  const installs: Array<{ idx: number; value: number }> = [];
  for (const m of html.matchAll(INSTALL_RE)) {
    installs.push({ idx: m.index ?? 0, value: Number(m[1]) });
  }
  for (const match of html.matchAll(HREF_RE)) {
    const path = (match[1] ?? '').trim();
    if (!path || path === 'tree/main') continue; // GH-tree paths leak in
    if (seen.has(path)) continue;
    seen.add(path);
    const matchIdx = match.index ?? 0;
    // Pick the first installCount within 800 chars after the href.
    const near = installs.find(
      (e) => e.idx >= matchIdx && e.idx - matchIdx <= 800,
    );
    out.push({
      source_id: path,
      title: path.split('/').slice(-1)[0]?.replace(/-/g, ' ') ?? path,
      url: `https://lobehub.com/skills/${path}`,
      installs: near?.value ?? null,
      stars: null,
    });
  }
  return out;
}

function parseShortNumber(raw: string): number | null {
  const m = raw.replace(/,/g, '').match(/^(\d+(?:\.\d+)?)\s*([KMB])?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  switch (m[2]?.toUpperCase()) {
    case 'K': return Math.round(n * 1_000);
    case 'M': return Math.round(n * 1_000_000);
    case 'B': return Math.round(n * 1_000_000_000);
    default:  return Math.round(n);
  }
}

function scoreRow(r: ParsedRow): SkillRow {
  const installs = r.installs ?? 0;
  const score = Math.log1p(Math.max(0, installs));
  return {
    rank: 0,
    source_id: r.source_id,
    title: r.title,
    url: r.url,
    installs: r.installs,
    stars: r.stars,
    trending_score: Math.round(score * 1000) / 1000,
  };
}

function done(startedAt: string, items: number, redisPublished: boolean): RunResult {
  return {
    fetcher: 'lobehub-skills',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors: [],
  };
}
