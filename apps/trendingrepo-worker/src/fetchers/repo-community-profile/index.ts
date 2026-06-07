// repo-community-profile — scheduled batch enrichment of the registry's
// community profile (license, languages, README, owner org, etc.).
//
// The legacy path at `src/lib/repo-community-profile.ts` was on-demand only —
// triggered by signed-in users hitting POST /api/repos/{o}/{n}/community.
// Registry-only repos never had their profile hydrated, so the
// `RepoOwnerRepoSnapshot` card on a dropped-repo profile renders "—" for
// FOUNDED / LOCATION / MEMBERS / PUBLIC REPOS / TOTAL STARS / FOCUS / FUNDING.
//
// This worker fetcher closes the loop by batching the same 6-endpoint GH
// fan-out for the top-N registry repos (recency-ordered) on a schedule.
// It writes per-repo slugs `repo-community:{owner}__{name}` with a 24h TTL —
// the same shape the on-demand path writes, so both paths share the cache.
// The app's `refreshRepoCommunityProfileFromStore(fullName)` reads them
// unchanged. Last-writer-wins for that specific (owner, name) is benign.
//
// Independence: this fetcher re-implements the GH fan-out + parse INLINE
// rather than importing from the app, so the worker container stays free of
// the `next` runtime and the app's data-store. Identical fields, identical
// shape, identical slug.
//
// Wave 3A — 2026-05-27 hardening plan.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';
import { writeDynamicOutputMarker } from '../../lib/dynamic-output-marker.js';
import { pickGithubToken } from '../../lib/util/github-token-pool.js';

// --- env-tunable knobs -----------------------------------------------------

// Max bumped 100 → 300 (2026-05-27) to cover more of the dropped tail per
// run. At 6 GH endpoints × 300 repos / concurrency 4 ≈ 15 min wall-clock —
// within the hourly slot. Pool of 20 tokens absorbs the rate-limit fan-out
// (300 × 6 = 1800 calls/run; 5000/h per token; pool = 100k/h ceiling).
const COMMUNITY_PROFILE_LIMIT = Math.max(
  1,
  Math.min(
    300,
    Number.parseInt(process.env.COMMUNITY_PROFILE_LIMIT ?? '25', 10) || 25,
  ),
);
const CONCURRENCY = 4;
const TTL_SECONDS = 24 * 60 * 60;
const README_MAX_CHARS = 24_000;
const FETCH_TIMEOUT_MS = 12_000;

// --- registry shape (subset we read) ---------------------------------------

interface RegistryEntry {
  fullName: string;
  lastSeenAt: string;
}
interface RegistryPayload {
  repos?: Record<string, RegistryEntry>;
}

// --- output payload shape (mirrors src/lib/repo-community-profile.ts) ------

export interface CommunityProfilePayload {
  fullName: string;
  fetchedAt: string;
  license: { spdxId: string; name: string; url: string | null } | null;
  homepageUrl: string | null;
  defaultBranch: string;
  sizeKb: number;
  openIssues: number;
  hasSponsors: boolean;
  hasWiki: boolean;
  hasPages: boolean;
  hasDiscussions: boolean;
  archived: boolean;
  disabled: boolean;
  topics: string[];
  languages: {
    total: number;
    languages: Array<{ name: string; bytes: number; percent: number; color?: string }>;
  };
  health: number | null;
  fundingUrl: string | null;
  codeOfConductPresent: boolean;
  contributingPresent: boolean;
  readmePresent: boolean;
  documentationUrl: string | null;
  openPullsCount: number;
  readmeMarkdown: string | null;
  commitsLast52Weeks: number[];
  ownerProfile: {
    type: 'Organization' | 'User';
    name: string | null;
    bio: string | null;
    location: string | null;
    blog: string | null;
    twitterUsername: string | null;
    followers: number | null;
    publicRepos: number | null;
    membersCount: number | null;
    avatarUrl: string;
  } | null;
  fundingSources: Array<{ provider: string; url: string }>;
}

// --- GH endpoint shapes (subsets) ------------------------------------------

interface GithubRepoApi {
  full_name?: string;
  default_branch?: string;
  size?: number;
  open_issues_count?: number;
  archived?: boolean;
  disabled?: boolean;
  has_wiki?: boolean;
  has_pages?: boolean;
  has_discussions?: boolean;
  has_sponsors?: boolean;
  homepage?: string | null;
  topics?: string[];
  license?: { spdx_id?: string | null; name?: string | null; url?: string | null } | null;
}
interface GithubCommunityProfile {
  health_percentage?: number;
  documentation?: string | null;
  files?: {
    code_of_conduct?: unknown | null;
    contributing?: unknown | null;
    funding?: string | { html_url?: string | null; url?: string | null } | null;
    readme?: unknown | null;
  } | null;
}
interface GithubReadme {
  content?: string;
  encoding?: string;
}
interface GithubParticipation {
  all?: number[];
}
interface GithubOwnerOrg {
  type?: string;
  name?: string | null;
  description?: string | null;
  location?: string | null;
  blog?: string | null;
  twitter_username?: string | null;
  followers?: number;
  public_repos?: number;
  avatar_url?: string;
}
interface GithubOwnerUser {
  type?: string;
  name?: string | null;
  bio?: string | null;
  location?: string | null;
  blog?: string | null;
  twitter_username?: string | null;
  followers?: number;
  public_repos?: number;
  avatar_url?: string;
}

// --- helpers ---------------------------------------------------------------

export function payloadSlug(fullName: string): string {
  return `repo-community:${fullName.toLowerCase().replace('/', '__')}`;
}

function splitFullName(fullName: string): { owner: string; name: string } | null {
  const slashIdx = fullName.indexOf('/');
  if (slashIdx <= 0 || slashIdx === fullName.length - 1) return null;
  return {
    owner: fullName.slice(0, slashIdx),
    name: fullName.slice(slashIdx + 1),
  };
}

/**
 * Pure: select up to `limit` registry repos, ordered by `lastSeenAt`.
 *
 * `order` controls direction (default 'asc' = oldest-first):
 *   - 'asc' — dropped-tail-first. Right default for community-profile
 *     because the on-demand POST path already covers actively-visited
 *     (typically trending-tier) repos. The worker fetcher's job is the
 *     tail that never gets visited.
 *   - 'desc' — most-recently-seen first. Use for backfill/cold-start.
 *
 * Skips malformed entries. Exported for vitest.
 */
export function pickProfileCandidates(
  registry: RegistryPayload | null,
  limit: number = COMMUNITY_PROFILE_LIMIT,
  order: 'asc' | 'desc' = 'asc',
): string[] {
  const entries = Object.values(registry?.repos ?? {}).filter(
    (e): e is RegistryEntry =>
      !!e &&
      typeof e === 'object' &&
      typeof (e as RegistryEntry).fullName === 'string' &&
      (e as RegistryEntry).fullName.includes('/') &&
      typeof (e as RegistryEntry).lastSeenAt === 'string',
  );
  const dir = order === 'asc' ? 1 : -1;
  entries.sort((a, b) => {
    if (a.lastSeenAt < b.lastSeenAt) return -1 * dir;
    if (a.lastSeenAt > b.lastSeenAt) return 1 * dir;
    // Tiebreaker by fullName (case-insensitive): registry's hourly tick
    // updates ~700+ repos to the same lastSeenAt; without this the
    // sort is non-deterministic and the same block gets picked every
    // run, never reaching the alphabetic tail.
    const aN = a.fullName.toLowerCase();
    const bN = b.fullName.toLowerCase();
    return aN < bN ? -1 : aN > bN ? 1 : 0;
  });
  return entries.slice(0, limit).map((e) => e.fullName);
}

function buildLanguagesBreakdown(
  raw: Record<string, number> | null,
): CommunityProfilePayload['languages'] {
  if (!raw || typeof raw !== 'object') return { total: 0, languages: [] };
  const entries = Object.entries(raw).filter(
    ([n, b]) => typeof n === 'string' && typeof b === 'number' && b > 0,
  );
  const total = entries.reduce((acc, [, b]) => acc + b, 0);
  if (total <= 0) return { total: 0, languages: [] };
  const languages = entries
    .map(([name, bytes]) => ({
      name,
      bytes,
      percent: Math.round((bytes / total) * 1000) / 10,
    }))
    .sort((a, b) => b.bytes - a.bytes);
  return { total, languages };
}

function decodeReadme(raw: GithubReadme | null): string | null {
  if (!raw || typeof raw.content !== 'string') return null;
  const encoding = (raw.encoding ?? 'base64').toLowerCase();
  if (encoding !== 'base64') return null;
  try {
    const decoded = Buffer.from(raw.content, 'base64').toString('utf8');
    return decoded.length > README_MAX_CHARS
      ? decoded.slice(0, README_MAX_CHARS)
      : decoded;
  } catch {
    return null;
  }
}

function extractFundingUrl(community: GithubCommunityProfile | null): string | null {
  const funding = community?.files?.funding;
  if (!funding) return null;
  if (typeof funding === 'string') return funding;
  if (typeof funding === 'object') {
    if (typeof funding.html_url === 'string' && funding.html_url) return funding.html_url;
    if (typeof funding.url === 'string' && funding.url) return funding.url;
  }
  return null;
}

function buildFundingSources(args: {
  owner: string;
  fundingUrl: string | null;
  hasSponsors: boolean;
}): CommunityProfilePayload['fundingSources'] {
  const out: CommunityProfilePayload['fundingSources'] = [];
  if (args.hasSponsors) {
    out.push({ provider: 'github', url: `https://github.com/sponsors/${args.owner}` });
  }
  if (args.fundingUrl) {
    out.push({ provider: 'funding-yml', url: args.fundingUrl });
  }
  return out;
}

// --- GH fetch (pool-aware, null on non-2xx) --------------------------------

function ghHeaders(token: string | undefined): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'starscreener-community-profile',
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function ghJsonOrNull<T>(
  ctx: FetcherContext,
  path: string,
  token: string | undefined,
): Promise<T | null> {
  const url = `https://api.github.com${path}`;
  try {
    const { data } = await ctx.http.json<T>(url, {
      headers: ghHeaders(token),
      timeoutMs: FETCH_TIMEOUT_MS,
      useEtagCache: false,
    });
    return data ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch open-PR count via the Link header pagination trick.
 * per_page=1 + rel="last" page param = the count. No-link header = body length.
 *
 * Uses `globalThis.fetch` (Node 22 builtin) because the worker's
 * `ctx.http.json` wrapper doesn't surface response headers — we need the
 * `Link` header for the pagination trick to work. Subject to the same
 * FETCH_TIMEOUT_MS budget via AbortSignal.timeout.
 */
async function fetchOpenPullsCount(
  owner: string,
  name: string,
  token: string | undefined,
): Promise<number> {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
    name,
  )}/pulls?state=open&per_page=1`;
  try {
    const response = await fetch(url, {
      headers: ghHeaders(token),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return 0;
    const link = response.headers.get('link');
    if (link) {
      const match = /<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="last"/i.exec(link);
      if (match && match[1]) {
        const n = Number.parseInt(match[1], 10);
        if (Number.isFinite(n) && n >= 0) return n;
      }
    }
    // No Link header → fewer than 2 results. Fall through to body length.
    const body = (await response.json()) as unknown;
    return Array.isArray(body) ? body.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Owner profile detector: try /orgs first; fall back to /users.
 */
async function fetchOwnerProfile(
  ctx: FetcherContext,
  owner: string,
  token: string | undefined,
): Promise<CommunityProfilePayload['ownerProfile']> {
  const org = await ghJsonOrNull<GithubOwnerOrg>(
    ctx,
    `/orgs/${encodeURIComponent(owner)}`,
    token,
  );
  if (org && org.type === 'Organization') {
    return {
      type: 'Organization',
      name: org.name ?? null,
      bio: org.description ?? null,
      location: org.location ?? null,
      blog: org.blog ?? null,
      twitterUsername: org.twitter_username ?? null,
      followers: typeof org.followers === 'number' ? org.followers : null,
      publicRepos: typeof org.public_repos === 'number' ? org.public_repos : null,
      membersCount: null, // not in public API
      avatarUrl: org.avatar_url ?? '',
    };
  }
  const user = await ghJsonOrNull<GithubOwnerUser>(
    ctx,
    `/users/${encodeURIComponent(owner)}`,
    token,
  );
  if (!user) return null;
  return {
    type: 'User',
    name: user.name ?? null,
    bio: user.bio ?? null,
    location: user.location ?? null,
    blog: user.blog ?? null,
    twitterUsername: user.twitter_username ?? null,
    followers: typeof user.followers === 'number' ? user.followers : null,
    publicRepos: typeof user.public_repos === 'number' ? user.public_repos : null,
    membersCount: null,
    avatarUrl: user.avatar_url ?? '',
  };
}

/**
 * Build the full per-repo payload. Returns null when the anchor repo endpoint
 * fails (e.g. 401/403/404) — every other endpoint degrades to null / [] but
 * the assembled profile still ships.
 */
export async function fetchProfile(
  ctx: FetcherContext,
  fullName: string,
  token: string | undefined,
): Promise<CommunityProfilePayload | null> {
  const parts = splitFullName(fullName);
  if (!parts) return null;
  const { owner, name } = parts;
  const ownerEnc = encodeURIComponent(owner);
  const nameEnc = encodeURIComponent(name);

  const repoBase = await ghJsonOrNull<GithubRepoApi>(
    ctx,
    `/repos/${ownerEnc}/${nameEnc}`,
    token,
  );
  if (!repoBase) return null;

  const [languages, community, readme, participation, openPullsCount, ownerProfile] =
    await Promise.all([
      ghJsonOrNull<Record<string, number>>(
        ctx,
        `/repos/${ownerEnc}/${nameEnc}/languages`,
        token,
      ),
      ghJsonOrNull<GithubCommunityProfile>(
        ctx,
        `/repos/${ownerEnc}/${nameEnc}/community/profile`,
        token,
      ),
      ghJsonOrNull<GithubReadme>(ctx, `/repos/${ownerEnc}/${nameEnc}/readme`, token),
      ghJsonOrNull<GithubParticipation>(
        ctx,
        `/repos/${ownerEnc}/${nameEnc}/stats/participation`,
        token,
      ),
      fetchOpenPullsCount(owner, name, token),
      fetchOwnerProfile(ctx, owner, token),
    ]);

  const fundingUrl = extractFundingUrl(community);
  const hasSponsors = repoBase.has_sponsors === true;

  const license = repoBase.license?.spdx_id
    ? {
        spdxId: repoBase.license.spdx_id,
        name: repoBase.license.name ?? repoBase.license.spdx_id,
        url: repoBase.license.url ?? null,
      }
    : null;

  return {
    fullName: repoBase.full_name ?? `${owner}/${name}`,
    fetchedAt: new Date().toISOString(),
    license,
    homepageUrl: repoBase.homepage ?? null,
    defaultBranch: repoBase.default_branch ?? 'main',
    sizeKb: typeof repoBase.size === 'number' ? repoBase.size : 0,
    openIssues:
      typeof repoBase.open_issues_count === 'number'
        ? repoBase.open_issues_count
        : 0,
    hasSponsors,
    hasWiki: repoBase.has_wiki === true,
    hasPages: repoBase.has_pages === true,
    hasDiscussions: repoBase.has_discussions === true,
    archived: repoBase.archived === true,
    disabled: repoBase.disabled === true,
    topics: Array.isArray(repoBase.topics) ? repoBase.topics : [],
    languages: buildLanguagesBreakdown(languages),
    health:
      typeof community?.health_percentage === 'number'
        ? community.health_percentage
        : null,
    fundingUrl,
    codeOfConductPresent: Boolean(community?.files?.code_of_conduct),
    contributingPresent: Boolean(community?.files?.contributing),
    readmePresent: Boolean(community?.files?.readme),
    documentationUrl: community?.documentation ?? null,
    openPullsCount,
    readmeMarkdown: decodeReadme(readme),
    commitsLast52Weeks: Array.isArray(participation?.all)
      ? participation!.all.filter((n): n is number => typeof n === 'number')
      : [],
    ownerProfile,
    fundingSources: buildFundingSources({ owner, fundingUrl, hasSponsors }),
  };
}

// --- fetcher --------------------------------------------------------------

const fetcher: Fetcher = {
  name: 'repo-community-profile',
  // :33 — gap between repo-registry :47, repo-metadata :13, deltas :40,
  // repo-profiles :41, and consensus-trending :50. No collision with the
  // top-of-hour burst.
  schedule: '33 * * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    const errors: RunResult['errors'] = [];

    if (ctx.dryRun) {
      ctx.log.info('repo-community-profile dry-run');
      return done(startedAt, 0, false, errors);
    }

    const token = pickGithubToken() ?? undefined;
    if (!token) {
      ctx.log.warn(
        'repo-community-profile: no GitHub token available in pool — skipping run',
      );
      return done(startedAt, 0, false, errors);
    }

    const registry = await readDataStore<RegistryPayload>('repo-registry').catch(
      () => null,
    );
    const candidates = pickProfileCandidates(registry, COMMUNITY_PROFILE_LIMIT);

    if (candidates.length === 0) {
      ctx.log.warn(
        'repo-community-profile: no registry candidates available (registry slug empty?)',
      );
      return done(startedAt, 0, false, errors);
    }

    let successCount = 0;
    let failureCount = 0;

    // Bounded-concurrency sweep — N workers pulling from a shared queue.
    const queue = [...candidates];
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const fullName = queue.shift();
        if (!fullName) break;
        try {
          const profile = await fetchProfile(ctx, fullName, token);
          if (!profile) {
            failureCount += 1;
            continue;
          }
          await writeDataStore(payloadSlug(fullName), profile, {
            ttlSeconds: TTL_SECONDS,
            writer: 'repo-community-profile',
          });
          successCount += 1;
        } catch (err) {
          failureCount += 1;
          errors.push({
            stage: `repo:${fullName}`,
            message: (err as Error).message ?? String(err),
          });
        }
      }
    });
    await Promise.all(workers);

    ctx.log.info(
      {
        candidates: candidates.length,
        success: successCount,
        failure: failureCount,
        registryRepos: Object.keys(registry?.repos ?? {}).length,
      },
      'repo-community-profile published',
    );

    const markerPublished = await writeDynamicOutputMarker({
      fetcher: 'repo-community-profile',
      outputPattern: 'repo-community:<owner>__<name>',
      startedAt,
      candidates: candidates.length,
      updated: successCount,
      skipped: failureCount,
      failed: errors.length,
    }).catch((err) => {
      errors.push({
        stage: 'write:worker-health:repo-community-profile',
        message: (err as Error).message ?? String(err),
      });
      return false;
    });

    return done(startedAt, successCount, markerPublished, errors);
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
    fetcher: 'repo-community-profile',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
