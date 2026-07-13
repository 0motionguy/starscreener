// LobeHub Skills Marketplace fetcher.
//
// LobeHub does not expose a public JSON API for /skills - the page is
// Next.js-rendered. We fetch its server-rendered HTML with the bounded worker
// HTTP client and parse skill paths/install counts locally.
//
// 288K+ skills indexed (per the homepage banner).
//
// Cron: 45 */12 * * *  (every 12h at :45, staggered from skills-sh / skillsmp / smithery-skills)
// Output: ss:data:v1:trending-skill-lobehub

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore } from '../../lib/redis.js';

const PAGE_URL = 'https://lobehub.com/skills';

// Keep a hard publication cap even if the upstream SSR payload grows.
const TOP_KEEP = 1000;
const RECENCY_HALF_LIFE_DAYS = 30;

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

  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('lobehub-skills dry-run');
      return done(startedAt, 0, false);
    }
    const errors: RunResult['errors'] = [];
    let rows: ParsedRow[] = [];
    // LobeHub SSRs its initial skill rows, so no browser service is needed.
    try {
      // ctx.http.text returns { data, cached } since the HTTP-cache wave;
      // parseLobehubHtml only wants the body string.
      // 30s (above 20s policy default) — lobehub.com's SSR'd skill listing
      // page can exceed 20s when the origin warms a cold worker.
      const { data: html } = await ctx.http.text(PAGE_URL, {
        timeoutMs: 30_000,
        useEtagCache: false,
        headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/120.0' },
      });
      rows = parseLobehubHtml(html);
    } catch (err) {
      errors.push({ stage: 'direct-http', message: (err as Error).message });
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
      { mode: 'native-http', items: ranked.length, totalSeen: rows.length, redisSource: result.source, writtenAt: result.writtenAt, errors: errors.length },
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

/**
 * Parse the raw SSR'd HTML from lobehub.com/skills. LobeHub uses Next.js App Router so
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
