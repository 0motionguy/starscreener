// GitHub recently-created-repo discovery fetcher.
//
// Calls GitHub Search for three broad recency windows plus one lane for each
// public category, balances the result, and publishes it to
// `ss:data:v1:recent-repos`.
//
// Cadence: hourly at :25. GitHub Search counts as a separate API quota pool
// from REST. We disable ETag caching because the query embeds a
// rolling `created:>=YYYY-MM-DD` date that changes daily AND because the
// payload itself updates as new repos cross the star threshold.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';
import { RateLimitQuarantineError, TransientHttpError } from '../../lib/errors.js';
import {
  getGithubTokens,
  pickGithubToken,
  quarantine,
} from '../../lib/util/github-token-pool.js';
import { caseInsensitiveKey, mergeAndCap } from '../../lib/util/cache-merge.js';

const API_URL = 'https://api.github.com/search/repositories';
const API_VERSION = '2022-11-28';
const PER_PAGE = 100;
const MAX_ITEMS = 300;
const CATEGORY_RESERVE = 5;

export interface DiscoveryQuery {
  id: string;
  days: number;
  minStars: number;
  pages: number;
  categoryId?: string;
  qualifier?: string;
}

const GENERAL_QUERIES: DiscoveryQuery[] = [
  { id: 'general:1d', days: 1, minStars: 5, pages: 2 },
  { id: 'general:3d', days: 3, minStars: 20, pages: 2 },
  { id: 'general:7d', days: 7, minStars: 60, pages: 1 },
];

export const CATEGORY_QUERIES: DiscoveryQuery[] = [
  ['ai-agents', 'topic:ai-agent'],
  ['mcp', 'topic:model-context-protocol'],
  ['devtools', 'topic:developer-tools'],
  ['browser-automation', 'topic:browser-automation'],
  ['local-llm', 'topic:local-llm'],
  ['security', 'topic:cybersecurity'],
  ['infrastructure', 'topic:devops'],
  ['design-engineering', 'topic:design-system'],
  ['ai-ml', 'topic:machine-learning'],
  ['web-frameworks', 'topic:web-framework'],
  ['databases', 'topic:database'],
  ['mobile', 'topic:mobile-development'],
  ['data-analytics', 'topic:data-engineering'],
  ['crypto-web3', 'topic:web3'],
  ['rust-ecosystem', 'language:Rust'],
].map(([categoryId, qualifier]) => ({
  id: `category:${categoryId}`,
  categoryId,
  qualifier,
  days: 30,
  minStars: 5,
  pages: 1,
}));

export const DISCOVERY_QUERIES: DiscoveryQuery[] = [
  ...GENERAL_QUERIES,
  ...CATEGORY_QUERIES,
];

interface GithubSearchResponse {
  total_count?: number;
  incomplete_results?: boolean;
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
  discoveredBy?: string[];
  firstDiscoveredAt?: string;
  lastDiscoveredAt?: string;
}

export interface RecentReposPayload {
  fetchedAt: string;
  items: RecentRepoRow[];
  diagnostics?: {
    attemptedQueries: number;
    succeededQueries: number;
    incompleteQueries: number;
    totalCount: number;
    rawRows: number;
  };
}

function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function buildQuery(query: DiscoveryQuery): string {
  const createdFrom = isoDateDaysAgo(query.days);
  return [
    `created:>=${createdFrom}`,
    `stars:>=${query.minStars}`,
    'is:public',
    'archived:false',
    'fork:false',
    query.qualifier,
  ].filter(Boolean).join(' ');
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

function normalizeRepo(item: GithubRepoItem, queryId: string, fetchedAt: string): RecentRepoRow {
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
    discoveredBy: [queryId],
    firstDiscoveredAt: fetchedAt,
    lastDiscoveredAt: fetchedAt,
  };
}

interface SearchResult {
  rows: RecentRepoRow[];
  totalCount: number;
  incomplete: boolean;
}

function canRetryWithAnotherToken(err: unknown): boolean {
  return (
    err instanceof RateLimitQuarantineError ||
    (err instanceof TransientHttpError && (err.httpStatus === 401 || err.httpStatus === 403))
  );
}

async function fetchPage(
  ctx: FetcherContext,
  url: string,
): Promise<GithubSearchResponse> {
  const hasConfiguredTokens = getGithubTokens().length > 0;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = pickGithubToken('search') ?? undefined;
    if (!token && hasConfiguredTokens) {
      throw new RateLimitQuarantineError('GitHub token pool exhausted');
    }
    try {
      const { data } = await ctx.http.json<GithubSearchResponse>(url, {
        headers: requestHeaders(token),
        timeoutMs: 20_000,
        maxRetries: 0,
        useEtagCache: false,
      });
      return data;
    } catch (err) {
      if (token && err instanceof TransientHttpError && err.httpStatus === 401) {
        quarantine(token);
      }
      if (attempt === 1 || !canRetryWithAnotherToken(err)) throw err;
    }
  }
  throw new Error('GitHub search retry exhausted');
}

async function fetchDiscoveryQuery(
  ctx: FetcherContext,
  query: DiscoveryQuery,
  fetchedAt: string,
): Promise<SearchResult> {
  const rows: RecentRepoRow[] = [];
  const search = buildQuery(query);
  let totalCount = 0;
  let incomplete = false;

  for (let page = 1; page <= query.pages; page += 1) {
    const url = new URL(API_URL);
    url.searchParams.set('q', search);
    url.searchParams.set('sort', 'stars');
    url.searchParams.set('order', 'desc');
    url.searchParams.set('per_page', String(PER_PAGE));
    url.searchParams.set('page', String(page));

    try {
      const body = await fetchPage(ctx, url.toString());
      totalCount = Math.max(totalCount, body.total_count ?? 0);
      incomplete ||= body.incomplete_results === true;
      const items = Array.isArray(body.items) ? body.items : [];
      for (const item of items) {
        if (!item?.full_name || !item.full_name.includes('/')) continue;
        if (item.archived || item.disabled) continue;
        rows.push(normalizeRepo(item, query.id, fetchedAt));
      }
      if (items.length < PER_PAGE) break;
    } catch (err) {
      throw new Error(
        `GitHub search failed (${query.id} page ${page}): ${(err as Error).message}`,
      );
    }
  }

  return { rows, totalCount, incomplete };
}

function isObviousSpam(row: RecentRepoRow): boolean {
  const name = row.fullName.toLowerCase();
  const text = [row.description, ...row.topics].join(' ').toLowerCase();
  const namePatterns = [
    /[-_/](crack|cracked)$/,
    /[-_](crack|cracked)[-_](20\d\d|latest|full|free|download|premium|pro|repack|patch(ed)?)\b/,
    /\b(premium|pro|full)[-_]?cracked\b/,
    /\b(keygen|nulled|warez|activator|aimbot|wallhack|mod-menu)\b/,
    /\b(external[-_]dayz[-_]cheats?|elden[-_]ring[-_]unlocked[-_]tools?|red[-_]giant[-_]download)\b/,
    /\bpre-?activated\b/,
    /\b(we-the-north|wethenorth|darknet)\b/,
    /[-_]market[-_]market[-_]/,
    /\bfake[- ]?(btc|bitcoin)\b/,
  ];
  const textPatterns = [
    /\b(activation key|serial key|license key generator)\b/,
    /\bfree download\b[^.]{0,40}\b(crack|cracked|full version|premium)\b/,
    /\b(keygen|nulled|warez)\b/,
    /\bcracked (version|software|download|apk|full)\b/,
    /\bpre-?activated\b/,
  ];
  return namePatterns.some((pattern) => pattern.test(name)) ||
    textPatterns.some((pattern) => pattern.test(text));
}

function discoveryScore(row: RecentRepoRow, nowMs: number): number {
  const createdMs = Date.parse(row.createdAt);
  const ageDays = Number.isFinite(createdMs)
    ? Math.max(1, (nowMs - createdMs) / 86_400_000)
    : 365;
  return row.stars / ageDays;
}

function compareDiscovery(a: RecentRepoRow, b: RecentRepoRow, nowMs: number): number {
  return (
    discoveryScore(b, nowMs) - discoveryScore(a, nowMs) ||
    b.stars - a.stars ||
    Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
    a.fullName.localeCompare(b.fullName)
  );
}

function mergeProvenance(current: RecentRepoRow, next: RecentRepoRow): RecentRepoRow {
  const first = [current.firstDiscoveredAt, next.firstDiscoveredAt]
    .filter((value): value is string => Boolean(value))
    .sort()[0];
  const last = [current.lastDiscoveredAt, next.lastDiscoveredAt]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  return {
    ...next,
    discoveredBy: Array.from(
      new Set([...(current.discoveredBy ?? []), ...(next.discoveredBy ?? [])]),
    ),
    ...(first ? { firstDiscoveredAt: first } : {}),
    ...(last ? { lastDiscoveredAt: last } : {}),
  };
}

export function selectRecentRepos(
  candidates: readonly RecentRepoRow[],
  max: number = MAX_ITEMS,
): RecentRepoRow[] {
  const deduped = new Map<string, RecentRepoRow>();
  for (const row of candidates) {
    const key = row.fullName.toLowerCase();
    if (!key || isObviousSpam(row)) continue;
    const current = deduped.get(key);
    deduped.set(key, current ? mergeProvenance(current, row) : row);
  }

  const nowMs = Date.now();
  const ranked = Array.from(deduped.values()).sort((a, b) => compareDiscovery(a, b, nowMs));
  const selected = new Map<string, RecentRepoRow>();
  for (const query of CATEGORY_QUERIES) {
    for (const row of ranked) {
      if (selected.size >= max) break;
      if (!row.discoveredBy?.includes(query.id)) continue;
      selected.set(row.fullName.toLowerCase(), row);
      if (
        Array.from(selected.values()).filter((candidate) =>
          candidate.discoveredBy?.includes(query.id),
        ).length >= CATEGORY_RESERVE
      ) {
        break;
      }
    }
  }
  for (const row of ranked) {
    if (selected.size >= max) break;
    selected.set(row.fullName.toLowerCase(), row);
  }
  return Array.from(selected.values()).sort((a, b) => compareDiscovery(a, b, nowMs));
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

    const fetchedAt = new Date().toISOString();
    const candidates: RecentRepoRow[] = [];
    let succeededQueries = 0;
    let incompleteQueries = 0;
    let totalCount = 0;

    for (const query of DISCOVERY_QUERIES) {
      try {
        const result = await fetchDiscoveryQuery(ctx, query, fetchedAt);
        succeededQueries += 1;
        incompleteQueries += result.incomplete ? 1 : 0;
        totalCount += result.totalCount;
        candidates.push(...result.rows);
        ctx.log.info(
          {
            query: query.id,
            rows: result.rows.length,
            totalCount: result.totalCount,
            incomplete: result.incomplete,
          },
          'recent-repos query fetched',
        );
      } catch (err) {
        const message = (err as Error).message;
        ctx.log.error({ query: query.id, err: message }, 'query failed');
        errors.push({ stage: query.id, message });
      }
    }

    // Read existing -> union -> cap. Failed runs do not advance freshness.
    const fresh = selectRecentRepos(candidates, MAX_ITEMS);
    const existing = await readDataStore<RecentReposPayload>('recent-repos').catch(() => null);
    const existingItems = Array.isArray(existing?.items) ? existing.items : [];

    if (succeededQueries === 0 || (fresh.length === 0 && existingItems.length > 0)) {
      ctx.log.warn(
        { existingItems: existingItems.length, errors: errors.length, succeededQueries },
        'recent-repos: no usable fresh rows; preserving prior payload without moving freshness',
      );
      return done(startedAt, existingItems.length, false, errors);
    }

    const merged = mergeRecentRepos(existingItems, fresh, Number.POSITIVE_INFINITY);
    const items = selectRecentRepos(merged, MAX_ITEMS);
    const payload: RecentReposPayload = {
      fetchedAt,
      items,
      diagnostics: {
        attemptedQueries: DISCOVERY_QUERIES.length,
        succeededQueries,
        incompleteQueries,
        totalCount,
        rawRows: candidates.length,
      },
    };
    const result = await writeDataStore('recent-repos', payload);

    ctx.log.info(
      {
        items: items.length,
        fresh: fresh.length,
        existing: existingItems.length,
        redisSource: result.source,
        writtenAt: result.writtenAt,
      },
      'recent-repos published',
    );

    return done(startedAt, items.length, result.source === 'redis', errors);
  },
};

/**
 * Pure merge helper for the recent-repos cache: union existing + fresh rows
 * (fresh wins on case-insensitive fullName collision), sort newest-first by
 * createdAt then by stars desc, cap at `max`. Thin wrapper over the shared
 * `mergeAndCap` primitive so the local tests continue to exercise this
 * exact comparator/key shape.
 *
 * The semantics match the registry's `buildRegistry` pattern (read → union →
 * dedupe → cap, never empty). Use the shared helper directly for new
 * fetchers; this re-export stays for back-compat with existing callers.
 */
export function mergeRecentRepos(
  existing: RecentRepoRow[],
  fresh: RecentRepoRow[],
  max: number = MAX_ITEMS,
): RecentRepoRow[] {
  return mergeAndCap({
    existing,
    fresh,
    key: caseInsensitiveKey<RecentRepoRow>('fullName'),
    compare: (a, b) => {
      const createdDelta = Date.parse(b.createdAt) - Date.parse(a.createdAt);
      if (createdDelta !== 0) return createdDelta;
      return b.stars - a.stars;
    },
    max,
  });
}

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
