// GitHub recently-created-repo discovery fetcher.
//
// Ports `scripts/discover-recent-repos.mjs`. Calls the GitHub Search
// REST API for repos created in the last {1,3,7} days with star
// thresholds, dedupes by owner/repo, sorts newest-first, and publishes
// the result to `ss:data:v1:recent-repos`.
//
// Cadence: hourly at :27 (matches the same fast-refresh GH workflow that
// runs scrape-trending). GitHub Search counts as a separate API quota
// pool from REST; using GH_PAT (when set) raises the quota from 10 to 30
// req/min on search. We disable ETag caching because the query embeds a
// rolling `created:>=YYYY-MM-DD` date that changes daily AND because the
// payload itself updates as new repos cross the star threshold.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore } from '../../lib/redis.js';
import { loadEnv } from '../../lib/env.js';

const API_URL = 'https://api.github.com/search/repositories';
const API_VERSION = '2022-11-28';
const PER_PAGE = 100;
const MAX_ITEMS = 120;

interface SearchWindow {
  days: number;
  minStars: number;
  pages: number;
}

const WINDOWS: SearchWindow[] = [
  { days: 1, minStars: 5, pages: 2 },
  { days: 3, minStars: 20, pages: 2 },
  { days: 7, minStars: 60, pages: 1 },
];

interface GithubSearchResponse {
  items?: GithubRepoItem[];
}

interface GithubRepoItem {
  id?: number;
  full_name?: string;
  name?: string;
  owner?: { login?: string; avatar_url?: string };
  description?: string | null;
  html_url?: string;
  language?: string | null;
  topics?: string[];
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  created_at?: string;
  updated_at?: string;
  pushed_at?: string;
  archived?: boolean;
  disabled?: boolean;
}

export interface RecentRepoRow {
  githubId: number | undefined;
  fullName: string;
  name: string;
  owner: string;
  ownerAvatarUrl: string;
  description: string;
  url: string;
  language: string | null;
  topics: string[];
  stars: number;
  forks: number;
  openIssues: number;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
}

export interface RecentReposPayload {
  fetchedAt: string;
  items: RecentRepoRow[];
}

function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function buildQuery(window: SearchWindow): string {
  const createdFrom = isoDateDaysAgo(window.days);
  return [
    `created:>=${createdFrom}`,
    `stars:>=${window.minStars}`,
    'archived:false',
    'fork:false',
  ].join(' ');
}

function requestHeaders(token: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': API_VERSION,
    'User-Agent': 'starscreener-discovery-bot',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function normalizeRepo(item: GithubRepoItem): RecentRepoRow {
  return {
    githubId: item.id,
    fullName: String(item.full_name ?? ''),
    name: String(item.name ?? ''),
    owner: item.owner?.login ?? '',
    ownerAvatarUrl: item.owner?.avatar_url ?? '',
    description: item.description ?? '',
    url: String(item.html_url ?? ''),
    language: item.language ?? null,
    topics: Array.isArray(item.topics) ? item.topics : [],
    stars: item.stargazers_count ?? 0,
    forks: item.forks_count ?? 0,
    openIssues: item.open_issues_count ?? 0,
    createdAt: String(item.created_at ?? ''),
    updatedAt: String(item.updated_at ?? ''),
    pushedAt: String(item.pushed_at ?? ''),
  };
}

async function fetchSearchWindow(
  ctx: FetcherContext,
  window: SearchWindow,
  token: string | undefined,
): Promise<RecentRepoRow[]> {
  const rows: RecentRepoRow[] = [];
  const query = buildQuery(window);

  for (let page = 1; page <= window.pages; page += 1) {
    const url = new URL(API_URL);
    url.searchParams.set('q', query);
    url.searchParams.set('sort', 'stars');
    url.searchParams.set('order', 'desc');
    url.searchParams.set('per_page', String(PER_PAGE));
    url.searchParams.set('page', String(page));

    let body: GithubSearchResponse;
    try {
      const { data } = await ctx.http.json<GithubSearchResponse>(url.toString(), {
        headers: requestHeaders(token),
        timeoutMs: 15_000,
        useEtagCache: false,
      });
      body = data;
    } catch (err) {
      throw new Error(
        `GitHub search failed (${window.days}d page ${page}): ${(err as Error).message}`,
      );
    }

    const items = Array.isArray(body.items) ? body.items : [];
    for (const item of items) {
      if (!item?.full_name || !item.full_name.includes('/')) continue;
      if (item.archived || item.disabled) continue;
      rows.push(normalizeRepo(item));
    }

    if (items.length < PER_PAGE) break;
  }

  return rows;
}

const fetcher: Fetcher = {
  name: 'recent-repos',
  // Staggered to :25 (was :27 — clustered with 3 heavyweights). Runs after
  // oss-trending (:22) and before trustmrr (:27), reddit (:30).
  schedule: '25 * * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    const errors: RunResult['errors'] = [];

    if (ctx.dryRun) {
      ctx.log.info('recent-repos dry-run');
      return done(startedAt, 0, false, errors);
    }

    const env = loadEnv();
    // Reuse the worker's GH_PAT if set (Phase 2 token-pool env hadn't been
    // ported into the worker schema yet; single-token path is fine — this
    // fetcher does ~5 search-API calls per tick which sits well below the
    // 30 req/min authenticated quota).
    const token = env.GH_PAT;
    const fetchedAt = new Date().toISOString();
    const deduped = new Map<string, RecentRepoRow>();

    for (const window of WINDOWS) {
      let rows: RecentRepoRow[] = [];
      try {
        rows = await fetchSearchWindow(ctx, window, token);
        ctx.log.info(
          { days: window.days, minStars: window.minStars, rows: rows.length },
          'recent-repos window fetched',
        );
      } catch (err) {
        const message = (err as Error).message;
        ctx.log.error({ window: window.days, err: message }, 'window failed');
        errors.push({ stage: `window:${window.days}d`, message });
        continue;
      }
      for (const row of rows) {
        const key = row.fullName.toLowerCase();
        const existing = deduped.get(key);
        if (!existing) {
          deduped.set(key, row);
          continue;
        }
        const existingCreated = Date.parse(existing.createdAt);
        const nextCreated = Date.parse(row.createdAt);
        if (
          nextCreated > existingCreated ||
          (nextCreated === existingCreated && row.stars > existing.stars)
        ) {
          deduped.set(key, row);
        }
      }
    }

    const items = Array.from(deduped.values())
      .sort((a, b) => {
        const createdDelta = Date.parse(b.createdAt) - Date.parse(a.createdAt);
        if (createdDelta !== 0) return createdDelta;
        return b.stars - a.stars;
      })
      .slice(0, MAX_ITEMS);

    const payload: RecentReposPayload = { fetchedAt, items };
    const result = await writeDataStore('recent-repos', payload);

    ctx.log.info(
      { items: items.length, redisSource: result.source, writtenAt: result.writtenAt },
      'recent-repos published',
    );

    return done(startedAt, items.length, result.source === 'redis', errors);
  },
};

export default fetcher;

function done(
  startedAt: string,
  items: number,
  redisPublished: boolean,
  errors: RunResult['errors'],
): RunResult {
  return {
    fetcher: 'recent-repos',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
