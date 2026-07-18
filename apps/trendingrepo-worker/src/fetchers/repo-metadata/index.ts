// Hydrate lifetime GitHub repo metadata for repos discovered by upstream
// signal feeds. Reads `trending`, `recent-repos`, `manual-repos` payloads
// from Redis (written by Group 1 fetchers) and queries the GitHub GraphQL
// API in batches of 25 for stargazerCount, forkCount, topics, etc.
//
// Slug: `repo-metadata`. Cadence: hourly at :13. The worker owns production
// metadata hydration; the legacy workflow no longer runs a duplicate recent
// discovery pass. Downstream consumers assume hourly fresh metadata.
//
// Auth: GH_TOKEN_POOL or GITHUB_TOKEN. Throws when no PAT is available.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore, readDataStore } from '../../lib/redis.js';
import { shouldPreserveCache } from '../../lib/util/cache-merge.js';
import { fetchJsonWithRetry } from '../../lib/util/http-helpers.js';
import {
  getGithubTokens,
  parseRateLimitHeaders,
  pickGithubToken,
  quarantine,
  recordRateLimit,
} from '../../lib/util/github-token-pool.js';
import {
  METRICS,
  SEED_COLLECTION_RANKINGS,
} from '../collection-rankings/fallback.js';

const GRAPHQL_URL = 'https://api.github.com/graphql';
const API_VERSION = '2022-11-28';
const BATCH_SIZE = Math.max(
  1,
  Math.min(50, Number.parseInt(process.env.REPO_METADATA_BATCH_SIZE ?? '25', 10) || 25),
);

interface TrendingRow {
  repo_name?: string;
}

interface TrendingPayload {
  buckets?: Record<string, Record<string, TrendingRow[]>>;
}

interface RecentReposPayload {
  items?: Array<{ fullName?: string }>;
}

interface ManualReposPayload {
  items?: Array<{ fullName?: string }>;
}

interface RepoMetadataItem {
  githubId: number | null;
  fullName: string;
  name: string;
  owner: string;
  ownerAvatarUrl: string;
  description: string;
  url: string;
  homepageUrl: string | null;
  language: string | null;
  topics: string[];
  stars: number;
  forks: number;
  openIssues: number;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  defaultBranch: string | null;
  archived: boolean;
  disabled: boolean;
  fork: boolean;
  fetchedAt: string;
}

interface RepoMetadataPayload {
  fetchedAt: string;
  sourceCount: number;
  items: RepoMetadataItem[];
  failures: Array<{ fullName: string; reason: string; error?: string }>;
}

function addFullName(out: Map<string, string>, raw: unknown): void {
  const fullName = String(raw ?? '').trim();
  if (!fullName || !fullName.includes('/')) return;
  const [owner, name] = fullName.split('/');
  if (!owner || !name) return;
  out.set(fullName.toLowerCase(), fullName);
}

interface RegistryPayloadLite {
  repos?: Record<string, { fullName?: string; lastSeenAt?: string }>;
}

function addCollectionSeedRepos(out: Map<string, string>): void {
  for (const collection of Object.values(SEED_COLLECTION_RANKINGS.collections)) {
    for (const metric of METRICS) {
      for (const row of collection[metric] ?? []) {
        addFullName(out, row.repoName);
      }
    }
  }
}

function collectFullNames(
  trending: TrendingPayload | null,
  recentRepos: RecentReposPayload | null,
  manualRepos: ManualReposPayload | null,
  registry: RegistryPayloadLite | null,
): string[] {
  const names = new Map<string, string>();
  for (const periodBuckets of Object.values(trending?.buckets ?? {})) {
    for (const rows of Object.values(periodBuckets ?? {})) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows) addFullName(names, row?.repo_name);
    }
  }
  for (const row of recentRepos?.items ?? []) addFullName(names, row?.fullName);
  for (const row of manualRepos?.items ?? []) addFullName(names, row?.fullName);
  // Registry tier — every repo ever seen (includes ones dropped from trending).
  // Sorted by lastSeenAt desc so the natural map-insert order surfaces fresher
  // repos to the batch loop first; existing names are already keyed (dedup).
  // This closes the metadata gap that left registry-only profiles showing
  // "not available" for stars/lang/topics. Bounded by the registry cap (3000)
  // → at most 120 GH GraphQL batches at BATCH_SIZE=25.
  const registryEntries = Object.values(registry?.repos ?? {}).sort((a, b) =>
    (b.lastSeenAt ?? '') < (a.lastSeenAt ?? '') ? -1 : (b.lastSeenAt ?? '') > (a.lastSeenAt ?? '') ? 1 : 0,
  );
  for (const entry of registryEntries) addFullName(names, entry?.fullName);
  // The collection-ranking fallback is now GitHub-backed during OSSInsight
  // outages. Hydrate that curated roster here so collection health does not
  // depend on stale OSSInsight rows being present in the trending feed.
  addCollectionSeedRepos(names);
  return Array.from(names.values()).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase()),
  );
}

function splitFullName(fullName: string): { owner: string; name: string } {
  const slash = fullName.indexOf('/');
  return { owner: fullName.slice(0, slash), name: fullName.slice(slash + 1) };
}

interface GraphqlBatchPayload {
  query: string;
  variables: Record<string, string>;
}

function buildBatchQuery(batch: string[]): GraphqlBatchPayload {
  const variableDefs: string[] = [];
  const fields: string[] = [];
  const variables: Record<string, string> = {};
  batch.forEach((fullName, i) => {
    const { owner, name } = splitFullName(fullName);
    variableDefs.push(`$owner${i}: String!`, `$name${i}: String!`);
    variables[`owner${i}`] = owner;
    variables[`name${i}`] = name;
    fields.push(`
      r${i}: repository(owner: $owner${i}, name: $name${i}) {
        databaseId
        name
        nameWithOwner
        owner { login avatarUrl }
        description
        url
        homepageUrl
        primaryLanguage { name }
        repositoryTopics(first: 20) { nodes { topic { name } } }
        stargazerCount
        forkCount
        issues(states: OPEN) { totalCount }
        createdAt
        updatedAt
        pushedAt
        defaultBranchRef { name }
        isArchived
        isDisabled
        isFork
      }`);
  });
  return {
    query: `query RepoMetadata(${variableDefs.join(', ')}) {${fields.join('\n')}\n}`,
    variables,
  };
}

interface GraphqlRepoNode {
  databaseId?: number | null;
  name?: string;
  nameWithOwner?: string;
  owner?: { login?: string; avatarUrl?: string };
  description?: string | null;
  url?: string;
  homepageUrl?: string | null;
  primaryLanguage?: { name?: string } | null;
  repositoryTopics?: { nodes?: Array<{ topic?: { name?: string } }> };
  stargazerCount?: number;
  forkCount?: number;
  issues?: { totalCount?: number };
  createdAt?: string;
  updatedAt?: string;
  pushedAt?: string;
  defaultBranchRef?: { name?: string } | null;
  isArchived?: boolean;
  isDisabled?: boolean;
  isFork?: boolean;
}

interface GraphqlResponse {
  data?: Record<string, GraphqlRepoNode | null>;
  errors?: unknown[];
}

interface GraphqlErrorLike {
  type?: unknown;
  message?: unknown;
}

export interface GraphqlErrorSummary {
  notFoundCount: number;
  unexpectedCount: number;
  unexpectedSamples: string[];
}

export function summarizeGraphqlErrors(errors: unknown[]): GraphqlErrorSummary {
  let notFoundCount = 0;
  const unexpectedSamples: string[] = [];
  for (const error of errors) {
    const entry = error as GraphqlErrorLike;
    const type = typeof entry?.type === 'string' ? entry.type : '';
    const message = typeof entry?.message === 'string' ? entry.message : '';
    if (
      type === 'NOT_FOUND' &&
      message.includes('Could not resolve to a Repository')
    ) {
      notFoundCount += 1;
      continue;
    }
    unexpectedSamples.push(message || JSON.stringify(error));
  }
  return {
    notFoundCount,
    unexpectedCount: unexpectedSamples.length,
    unexpectedSamples: unexpectedSamples.slice(0, 3),
  };
}

function normalizeRepo(
  node: GraphqlRepoNode,
  requestedFullName: string,
  fetchedAt: string,
): RepoMetadataItem {
  const { owner: requestedOwner, name: requestedName } = splitFullName(requestedFullName);
  const topics =
    node.repositoryTopics?.nodes
      ?.map((entry) => entry?.topic?.name)
      .filter((n): n is string => typeof n === 'string' && n.length > 0) ?? [];
  return {
    githubId: node.databaseId ?? null,
    fullName: node.nameWithOwner ?? requestedFullName,
    name: node.name ?? requestedName,
    owner: node.owner?.login ?? requestedOwner,
    ownerAvatarUrl: node.owner?.avatarUrl ?? '',
    description: node.description ?? '',
    url: node.url ?? `https://github.com/${requestedFullName}`,
    homepageUrl: node.homepageUrl || null,
    language: node.primaryLanguage?.name ?? null,
    topics,
    stars: node.stargazerCount ?? 0,
    forks: node.forkCount ?? 0,
    openIssues: node.issues?.totalCount ?? 0,
    createdAt: node.createdAt ?? '',
    updatedAt: node.updatedAt ?? '',
    pushedAt: node.pushedAt ?? '',
    defaultBranch: node.defaultBranchRef?.name ?? null,
    archived: Boolean(node.isArchived),
    disabled: Boolean(node.isDisabled),
    fork: Boolean(node.isFork),
    fetchedAt,
  };
}

const fetcher: Fetcher = {
  name: 'repo-metadata',
  // Hourly at :13 keeps repo-profiles / trustmrr / /repo/* hydrated.
  schedule: '13 * * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();

    if (ctx.dryRun) {
      ctx.log.info('repo-metadata dry-run');
      return done(startedAt, 0, false, []);
    }

    if (getGithubTokens().length === 0) {
      const msg = 'GH_TOKEN_POOL / GITHUB_TOKEN not configured — skipping repo-metadata';
      ctx.log.warn(msg);
      return done(startedAt, 0, false, [{ stage: 'auth', message: msg }]);
    }

    // AUDIT-2026-05-04: allSettled so a single Redis flake degrades to
    // null instead of crashing the whole fetcher. Same fix as f39cd09d.
    const READ_KEYS = [
      'trending',
      'recent-repos',
      'manual-repos',
      'repo-metadata',
      'repo-registry',
    ] as const;
    const reads = await Promise.allSettled([
      readDataStore<TrendingPayload>('trending'),
      readDataStore<RecentReposPayload>('recent-repos'),
      readDataStore<ManualReposPayload>('manual-repos'),
      readDataStore<RepoMetadataPayload>('repo-metadata'),
      readDataStore<RegistryPayloadLite>('repo-registry'),
    ]);
    const readFailures: Array<{ key: string; err: string }> = [];
    const values = reads.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      readFailures.push({
        key: READ_KEYS[i] ?? `index-${i}`,
        err: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
      return null;
    });
    if (readFailures.length > 0) {
      ctx.log.warn(
        { failures: readFailures },
        'repo-metadata: some reads failed; degrading those sources to null',
      );
    }
    const [trending, recentRepos, manualRepos, previous, registry] = values as [
      TrendingPayload | null,
      RecentReposPayload | null,
      ManualReposPayload | null,
      RepoMetadataPayload | null,
      RegistryPayloadLite | null,
    ];

    const previousByName = new Map<string, RepoMetadataItem>();
    for (const item of previous?.items ?? []) {
      if (item?.fullName) previousByName.set(item.fullName.toLowerCase(), item);
    }

    const fetchedAt = new Date().toISOString();
    const fullNames = collectFullNames(trending, recentRepos, manualRepos, registry);
    const itemsByName = new Map<string, RepoMetadataItem>();
    const failures: RepoMetadataPayload['failures'] = [];
    const errors: RunResult['errors'] = [];
    let successfulBatches = 0;

    for (let offset = 0; offset < fullNames.length; offset += BATCH_SIZE) {
      const batch = fullNames.slice(offset, offset + BATCH_SIZE);
      const batchNo = Math.floor(offset / BATCH_SIZE) + 1;
      const batchTotal = Math.ceil(fullNames.length / BATCH_SIZE);
      const payload = buildBatchQuery(batch);
      try {
        const token = pickGithubToken();
        if (!token) throw new Error('GitHub token pool has no usable token');
        const body = await fetchJsonWithRetry<GraphqlResponse>(GRAPHQL_URL, {
          method: 'POST',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'starscreener-worker/repo-metadata',
            'X-GitHub-Api-Version': API_VERSION,
          },
          body: JSON.stringify(payload),
          attempts: 3,
          retryDelayMs: 1_000,
          timeoutMs: 20_000,
          onResponse: (res) => {
            if (res.status === 401) quarantine(token);
            const rl = parseRateLimitHeaders(res.headers);
            if (rl) recordRateLimit(token, rl.remaining, rl.resetUnixSec);
          },
        });
        successfulBatches += 1;
        const data = body?.data ?? {};
        const ghErrors = Array.isArray(body?.errors) ? body.errors : [];
        if (ghErrors.length > 0) {
          const errorSummary = summarizeGraphqlErrors(ghErrors);
          if (errorSummary.unexpectedCount > 0) {
            ctx.log.warn(
              { batchNo, batchTotal, ...errorSummary },
              'graphql unexpected errors in batch',
            );
          } else {
            ctx.log.info(
              { batchNo, batchTotal, notFoundCount: errorSummary.notFoundCount },
              'graphql not-found repos in batch',
            );
          }
        }
        batch.forEach((fullName, i) => {
          const node = data[`r${i}`];
          const key = fullName.toLowerCase();
          if (node) {
            itemsByName.set(key, normalizeRepo(node, fullName, fetchedAt));
            return;
          }
          const previousItem = previousByName.get(key);
          if (previousItem) itemsByName.set(key, previousItem);
          failures.push({
            fullName,
            reason: previousItem ? 'not-found-kept-previous' : 'not-found',
          });
        });
        ctx.log.info({ batchNo, batchTotal, repos: batch.length }, 'metadata batch ok');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ stage: `batch-${batchNo}`, message });
        for (const fullName of batch) {
          const key = fullName.toLowerCase();
          const previousItem = previousByName.get(key);
          if (previousItem) itemsByName.set(key, previousItem);
          failures.push({
            fullName,
            reason: previousItem ? 'batch-failed-kept-previous' : 'batch-failed',
            error: message,
          });
        }
      }
    }

    if (fullNames.length > 0 && successfulBatches === 0) {
      ctx.log.warn(
        { batches: Math.ceil(fullNames.length / BATCH_SIZE), failures: errors.length },
        'repo-metadata: every GitHub batch failed; preserving prior payload without moving freshness',
      );
      return done(startedAt, previous?.items?.length ?? 0, false, errors);
    }

    const items = Array.from(itemsByName.values()).sort((a, b) =>
      a.fullName.toLowerCase().localeCompare(b.fullName.toLowerCase()),
    );
    const out: RepoMetadataPayload = {
      fetchedAt,
      sourceCount: fullNames.length,
      items,
      failures,
    };
    // Zero-write guard (keep-last-50 rule): per-repo failures already keep the
    // previous item, but if the INPUT roster (trending/recent/manual/registry)
    // is all cold then fullNames is empty, the loop never runs, and items is
    // []. Writing that would zero repo-metadata and every /repo/* page that
    // reads it. Preserve the last-known-good slug instead.
    let redisSource = 'preserved';
    if (
      shouldPreserveCache<unknown>({
        fresh: items,
        existing: previous?.items ?? [],
      })
    ) {
      ctx.log.warn(
        'repo-metadata: empty roster (all input sources cold?) — preserving last-known-good repo-metadata',
      );
    } else {
      const result = await writeDataStore('repo-metadata', out);
      redisSource = result.source;
      ctx.log.info(
        {
          items: items.length,
          sourceCount: fullNames.length,
          failures: failures.length,
          redisSource: result.source,
        },
        'repo-metadata published',
      );
    }
    return done(startedAt, items.length, redisSource === 'redis', errors);
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
    fetcher: 'repo-metadata',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
