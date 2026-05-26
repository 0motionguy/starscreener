// Per-repo "community profile" snapshot — fetches the long-tail GitHub
// metadata the data spine does NOT already carry (license, languages
// breakdown, community health, README, 52-week commit cadence, owner
// profile, funding sources, open PR count) and caches it in Redis for
// 24h under `repo-community:{owner}__{name}`.
//
// SHAPE OF THIS MODULE (mirrors src/lib/star-activity.ts):
//
//   1. Per-process in-memory cache, keyed on lowercased "owner/name".
//   2. `refreshRepoCommunityProfileFromStore(fullName)` — pulls the latest
//      payload from Redis (or the bundled file / memory tier) and swaps
//      it into the in-memory cache. Internal 30s rate-limit + in-flight
//      dedupe so the profile page can call this on every render without
//      hammering Redis.
//   3. `getRepoCommunityProfile(fullName)` — synchronous getter. Returns
//      whatever's cached; null if `refreshXxxFromStore` never ran (or
//      the data-store has nothing for this repo).
//   4. `fetchRepoCommunityProfileLive(fullName)` — pool-aware GitHub
//      fetch for every endpoint in one go. Writes the result to Redis
//      with a 24h TTL. ONLY callable from the POST API route — never
//      from a page render.
//
// FAILURE POSTURE
//   Every GitHub endpoint is independent: a 404/timeout on one field
//   degrades that field to `null` / `[]` and the rest of the payload
//   still ships. We NEVER throw out of fetchRepoCommunityProfileLive —
//   the caller decides what to render against a partial profile.

import type { DataSource } from "./data-store";
import { githubFetch } from "./github-fetch";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RepoLanguagesBreakdown {
  total: number;
  languages: Array<{ name: string; bytes: number; percent: number; color?: string }>;
}

export interface RepoCommunityProfile {
  fullName: string;
  fetchedAt: string;

  // From GET /repos/{o}/{r}:
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

  // From GET /repos/{o}/{r}/languages:
  languages: RepoLanguagesBreakdown;

  // From GET /repos/{o}/{r}/community/profile:
  health: number | null;
  fundingUrl: string | null;
  codeOfConductPresent: boolean;
  contributingPresent: boolean;
  readmePresent: boolean;
  documentationUrl: string | null;

  // From GET /repos/{o}/{r}/pulls?state=open&per_page=1 (Link header pagination):
  openPullsCount: number;

  // From GET /repos/{o}/{r}/readme — base64-decoded, truncated to 24k chars:
  readmeMarkdown: string | null;

  // From GET /repos/{o}/{r}/stats/participation — `all` weekly counts:
  commitsLast52Weeks: number[];

  // From GET /orgs/{owner} or GET /users/{owner}:
  ownerProfile: {
    type: "Organization" | "User";
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

  /**
   * Optional editorial-org snapshot consumed by RepoOwnerRepoSnapshot.
   * Every field is optional — the loader populates what it can derive from
   * GitHub + hand-curated overrides; the component falls back to "—" /
   * `.dim` whenever a field is missing. Never invent values to fill it.
   *
   * Surfaced via the editorial pipeline (out-of-band of the GitHub fan-out
   * in `fetchRepoCommunityProfileLive`), so it can carry data GitHub will
   * never expose (founders, primary focus, funding stage).
   */
  organization?: {
    isVerified?: boolean;
    description?: string;
    blog?: string | null;
    twitterUsername?: string | null;
    huggingfaceHandle?: string | null;
    foundedAt?: string | null;
    location?: string | null;
    memberCount?: number | null;
    publicReposCount?: number | null;
    totalStars?: number | null;
    primaryFocus?: string | null;
    fundingStatus?: string | null;
    founders?: string[];
  };

  /**
   * Convenience mirror for the repo-snapshot card: present when we know we
   * have first-party top-level repo metadata (description, homepage). The
   * card falls back to the live `Repo.description` / `homepageUrl` when
   * this is absent.
   */
  description?: string;
  homepage?: string | null;

  /**
   * Optional aggregate counters surfaced by the snapshot card.
   * `contributorsCount` and `openPullRequests` exist on the live profile
   * via different field names; these mirrors keep the card decoupled from
   * GitHub-side naming so the loader can populate them from any source.
   */
  contributorsCount?: number | null;
  openPullRequests?: number | null;
  licenseSpdx?: string | null;
  primaryLanguageColor?: string | null;
}

// ---------------------------------------------------------------------------
// Cache + refresh dedupe
// ---------------------------------------------------------------------------

const cache = new Map<string, RepoCommunityProfile>();

interface RefreshState {
  inflight: Promise<RefreshOutcome> | null;
  lastRefreshMs: number;
}

const refreshState = new Map<string, RefreshState>();

interface LiveFetchState {
  inflight: Promise<RepoCommunityProfile | null> | null;
  lastFetchMs: number;
}

const liveFetchState = new Map<string, LiveFetchState>();

const MIN_REFRESH_INTERVAL_MS = 30_000;
const MIN_LIVE_FETCH_INTERVAL_MS = 30_000;
const CACHE_TTL_SECONDS = 24 * 60 * 60;
const README_MAX_CHARS = 24_000;

export interface RefreshOutcome {
  source: DataSource;
  ageMs: number;
}

function normalizeFullName(fullName: string): string {
  return fullName.toLowerCase();
}

function splitFullName(fullName: string): { owner: string; name: string } | null {
  const slashIdx = fullName.indexOf("/");
  if (slashIdx <= 0 || slashIdx === fullName.length - 1) return null;
  const owner = fullName.slice(0, slashIdx);
  const name = fullName.slice(slashIdx + 1);
  if (!owner || !name) return null;
  return { owner, name };
}

function payloadSlug(fullName: string): string {
  // Data-store slugs swap "/" for "__" — the file-mirror writer can't
  // otherwise distinguish "owner/name" from a nested directory. Stays
  // consistent with the star-activity payload-slug convention.
  return `repo-community:${normalizeFullName(fullName).replace("/", "__")}`;
}

// ---------------------------------------------------------------------------
// Synchronous reader + Redis refresher
// ---------------------------------------------------------------------------

/**
 * Synchronous getter for an already-fetched profile. Returns null when the
 * caller never ran `refreshRepoCommunityProfileFromStore` first OR the
 * data-store has nothing for this repo. Pair with the refresher exactly the
 * way `getStarActivity` / `refreshStarActivityFromStore` do in
 * src/lib/star-activity.ts.
 */
export function getRepoCommunityProfile(
  fullName: string,
): RepoCommunityProfile | null {
  return cache.get(normalizeFullName(fullName)) ?? null;
}

/**
 * Pull the latest community profile for `fullName` from the data-store and
 * swap it into the in-memory cache. Per-repo dedupe + 30s rate-limit so the
 * profile page can call this on every render.
 *
 * Never throws — on miss the existing cache entry is preserved (null if none).
 * This does NOT call the GitHub API — see `fetchRepoCommunityProfileLive`.
 */
export async function refreshRepoCommunityProfileFromStore(
  fullName: string,
): Promise<RefreshOutcome> {
  const key = normalizeFullName(fullName);
  const state = refreshState.get(key) ?? { inflight: null, lastRefreshMs: 0 };

  if (state.inflight) return state.inflight;

  const sinceLast = Date.now() - state.lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && state.lastRefreshMs > 0) {
    return { source: "memory", ageMs: sinceLast };
  }

  const promise = (async (): Promise<RefreshOutcome> => {
    const { getDataStore } = await import("./data-store");
    const store = getDataStore();
    const result = await store.read<RepoCommunityProfile>(payloadSlug(fullName));
    if (result.data && result.source !== "missing") {
      cache.set(key, result.data);
    }
    state.lastRefreshMs = Date.now();
    return { source: result.source, ageMs: result.ageMs };
  })().finally(() => {
    state.inflight = null;
  });

  state.inflight = promise;
  refreshState.set(key, state);
  return promise;
}

// ---------------------------------------------------------------------------
// Live fetch — GitHub REST endpoints
// ---------------------------------------------------------------------------

interface GitHubRepoApiResponse {
  full_name: string;
  default_branch?: string;
  size?: number;
  open_issues_count?: number;
  archived?: boolean;
  disabled?: boolean;
  has_wiki?: boolean;
  has_pages?: boolean;
  has_discussions?: boolean;
  homepage?: string | null;
  topics?: string[];
  license?: {
    spdx_id?: string | null;
    name?: string | null;
    url?: string | null;
  } | null;
}

interface GitHubCommunityProfileResponse {
  health_percentage?: number;
  documentation?: string | null;
  files?: {
    code_of_conduct?: unknown | null;
    contributing?: unknown | null;
    funding?:
      | string
      | { html_url?: string | null; url?: string | null }
      | null;
    readme?: unknown | null;
  } | null;
}

interface GitHubReadmeResponse {
  content?: string;
  encoding?: string;
}

interface GitHubParticipationResponse {
  all?: number[];
}

interface GitHubOwnerOrgResponse {
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

interface GitHubOwnerUserResponse {
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

/**
 * Pool-aware GitHub fetch wrapper that returns the parsed JSON body or null.
 * Treats every non-2xx as "field missing" so caller can degrade gracefully.
 */
async function fetchJsonOrNull<T>(
  path: string,
  operation: string,
): Promise<T | null> {
  let result;
  try {
    result = await githubFetch(path, {
      operation,
      awaitTelemetry: false,
    });
  } catch (err) {
    console.warn("[repo-community] github fetch threw", path, err);
    return null;
  }
  if (!result) return null;
  const { response } = result;
  if (!response.ok) return null;
  try {
    return (await response.json()) as T;
  } catch (err) {
    console.warn("[repo-community] non-JSON response", path, err);
    return null;
  }
}

/**
 * Fetch + parse the open-PR Link header. GitHub paginates pulls at
 * per_page=1 so the `rel="last"` Link entry's `page=` query parameter is
 * the open PR count. If no Link header exists, count is the response array
 * length (typically 0 or 1).
 */
async function fetchOpenPullsCount(owner: string, name: string): Promise<number> {
  const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pulls?state=open&per_page=1`;
  let result;
  try {
    result = await githubFetch(path, {
      operation: "repo-community-open-pulls",
      awaitTelemetry: false,
    });
  } catch (err) {
    console.warn("[repo-community] open-pulls fetch threw", path, err);
    return 0;
  }
  if (!result) return 0;
  const { response } = result;
  if (!response.ok) return 0;

  const link = response.headers.get("link");
  if (link) {
    // Link header format:
    //   <https://...&page=2>; rel="next", <https://...&page=N>; rel="last"
    // The `page=N` in the rel="last" entry IS the total count when per_page=1.
    const match = /<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="last"/i.exec(link);
    if (match && match[1]) {
      const n = Number.parseInt(match[1], 10);
      if (Number.isFinite(n) && n >= 0) return n;
    }
  }

  // No Link header → fewer than 2 results. Fall through to the body length.
  try {
    const body = (await response.json()) as unknown[];
    return Array.isArray(body) ? body.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Owner profile detector: orgs first (description field), then users (bio).
 * Returns null when neither endpoint resolves.
 */
async function fetchOwnerProfile(
  owner: string,
): Promise<RepoCommunityProfile["ownerProfile"]> {
  const orgPath = `/orgs/${encodeURIComponent(owner)}`;
  const org = await fetchJsonOrNull<GitHubOwnerOrgResponse>(
    orgPath,
    "repo-community-owner-org",
  );

  if (org && org.type === "Organization") {
    // /orgs/{owner} does not expose members_count without org-admin scope —
    // public API returns null. Surface that honestly rather than pretending
    // to know.
    return {
      type: "Organization",
      name: org.name ?? null,
      bio: org.description ?? null,
      location: org.location ?? null,
      blog: org.blog ?? null,
      twitterUsername: org.twitter_username ?? null,
      followers: typeof org.followers === "number" ? org.followers : null,
      publicRepos: typeof org.public_repos === "number" ? org.public_repos : null,
      membersCount: null,
      avatarUrl: org.avatar_url ?? "",
    };
  }

  const userPath = `/users/${encodeURIComponent(owner)}`;
  const user = await fetchJsonOrNull<GitHubOwnerUserResponse>(
    userPath,
    "repo-community-owner-user",
  );
  if (!user) return null;

  return {
    type: "User",
    name: user.name ?? null,
    bio: user.bio ?? null,
    location: user.location ?? null,
    blog: user.blog ?? null,
    twitterUsername: user.twitter_username ?? null,
    followers: typeof user.followers === "number" ? user.followers : null,
    publicRepos: typeof user.public_repos === "number" ? user.public_repos : null,
    membersCount: null,
    avatarUrl: user.avatar_url ?? "",
  };
}

function buildLanguagesBreakdown(
  raw: Record<string, number> | null,
): RepoLanguagesBreakdown {
  if (!raw || typeof raw !== "object") return { total: 0, languages: [] };
  const entries = Object.entries(raw).filter(
    ([name, bytes]) => typeof name === "string" && typeof bytes === "number" && bytes > 0,
  );
  const total = entries.reduce((acc, [, bytes]) => acc + bytes, 0);
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

function decodeReadme(raw: GitHubReadmeResponse | null): string | null {
  if (!raw || typeof raw.content !== "string") return null;
  const encoding = (raw.encoding ?? "base64").toLowerCase();
  if (encoding !== "base64") return null;
  try {
    // The GitHub README endpoint splits the base64 body with newlines that
    // Node's Buffer.from tolerates; no need to strip them up front.
    const decoded = Buffer.from(raw.content, "base64").toString("utf8");
    if (decoded.length > README_MAX_CHARS) {
      return decoded.slice(0, README_MAX_CHARS);
    }
    return decoded;
  } catch (err) {
    console.warn("[repo-community] readme decode failed", err);
    return null;
  }
}

function extractFundingUrl(
  community: GitHubCommunityProfileResponse | null,
): string | null {
  const funding = community?.files?.funding;
  if (!funding) return null;
  if (typeof funding === "string") return funding;
  if (typeof funding === "object") {
    if (typeof funding.html_url === "string" && funding.html_url) {
      return funding.html_url;
    }
    if (typeof funding.url === "string" && funding.url) {
      return funding.url;
    }
  }
  return null;
}

function buildFundingSources(opts: {
  owner: string;
  fundingUrl: string | null;
  hasSponsors: boolean;
}): RepoCommunityProfile["fundingSources"] {
  const out: RepoCommunityProfile["fundingSources"] = [];
  if (opts.hasSponsors) {
    out.push({
      provider: "github",
      url: `https://github.com/sponsors/${opts.owner}`,
    });
  }
  if (opts.fundingUrl) {
    out.push({ provider: "funding-yml", url: opts.fundingUrl });
  }
  return out;
}

/**
 * Live fetch from GitHub for every endpoint that feeds the community profile.
 * Writes the result to the data-store (Redis tier when configured) with a 24h
 * TTL and returns the fresh profile.
 *
 * Returns null only when the repo itself is unreachable (the canonical
 * `/repos/{owner}/{name}` call fails or returns non-OK). Every other endpoint
 * degrades to null / [] without short-circuiting the rest.
 *
 * Concurrency: per-repo dedupe + 30s minimum interval. Concurrent callers
 * share a single in-flight Promise so the GitHub PAT pool isn't burned by
 * a hot retry loop.
 */
export async function fetchRepoCommunityProfileLive(
  fullName: string,
): Promise<RepoCommunityProfile | null> {
  const parts = splitFullName(fullName);
  if (!parts) return null;
  const key = normalizeFullName(fullName);

  const state = liveFetchState.get(key) ?? { inflight: null, lastFetchMs: 0 };
  if (state.inflight) return state.inflight;

  const sinceLast = Date.now() - state.lastFetchMs;
  if (sinceLast < MIN_LIVE_FETCH_INTERVAL_MS && state.lastFetchMs > 0) {
    // Recent caller already fetched within the dedupe window — return whatever
    // landed in the in-memory cache so the POST handler stays cheap.
    return cache.get(key) ?? null;
  }

  const promise = (async (): Promise<RepoCommunityProfile | null> => {
    const { owner, name } = parts;
    const ownerEnc = encodeURIComponent(owner);
    const nameEnc = encodeURIComponent(name);

    // Anchor call — if the repo endpoint itself fails we can't ship a profile.
    const repoBase = await fetchJsonOrNull<GitHubRepoApiResponse>(
      `/repos/${ownerEnc}/${nameEnc}`,
      "repo-community-repo",
    );
    if (!repoBase) return null;

    const hasSponsors = hasGithubSponsorsFlag(repoBase);

    // Fan out every independent endpoint in parallel. Each is null-safe so a
    // single failure does not poison the assembled profile.
    const [
      languagesRaw,
      community,
      readmeRaw,
      participation,
      openPullsCount,
      ownerProfile,
    ] = await Promise.all([
      fetchJsonOrNull<Record<string, number>>(
        `/repos/${ownerEnc}/${nameEnc}/languages`,
        "repo-community-languages",
      ),
      fetchJsonOrNull<GitHubCommunityProfileResponse>(
        `/repos/${ownerEnc}/${nameEnc}/community/profile`,
        "repo-community-profile",
      ),
      fetchJsonOrNull<GitHubReadmeResponse>(
        `/repos/${ownerEnc}/${nameEnc}/readme`,
        "repo-community-readme",
      ),
      fetchJsonOrNull<GitHubParticipationResponse>(
        `/repos/${ownerEnc}/${nameEnc}/stats/participation`,
        "repo-community-participation",
      ),
      fetchOpenPullsCount(owner, name),
      fetchOwnerProfile(owner),
    ]);

    const fundingUrl = extractFundingUrl(community);

    const license = repoBase.license?.spdx_id
      ? {
          spdxId: repoBase.license.spdx_id,
          name: repoBase.license.name ?? repoBase.license.spdx_id,
          url: repoBase.license.url ?? null,
        }
      : null;

    const profile: RepoCommunityProfile = {
      fullName: repoBase.full_name ?? `${owner}/${name}`,
      fetchedAt: new Date().toISOString(),

      license,
      homepageUrl: repoBase.homepage ?? null,
      defaultBranch: repoBase.default_branch ?? "main",
      sizeKb: typeof repoBase.size === "number" ? repoBase.size : 0,
      openIssues:
        typeof repoBase.open_issues_count === "number"
          ? repoBase.open_issues_count
          : 0,
      hasSponsors,
      hasWiki: repoBase.has_wiki === true,
      hasPages: repoBase.has_pages === true,
      hasDiscussions: repoBase.has_discussions === true,
      archived: repoBase.archived === true,
      disabled: repoBase.disabled === true,
      topics: Array.isArray(repoBase.topics) ? repoBase.topics : [],

      languages: buildLanguagesBreakdown(languagesRaw),

      health:
        typeof community?.health_percentage === "number"
          ? community.health_percentage
          : null,
      fundingUrl,
      codeOfConductPresent: Boolean(community?.files?.code_of_conduct),
      contributingPresent: Boolean(community?.files?.contributing),
      readmePresent: Boolean(community?.files?.readme),
      documentationUrl: community?.documentation ?? null,

      openPullsCount,

      readmeMarkdown: decodeReadme(readmeRaw),

      commitsLast52Weeks: Array.isArray(participation?.all)
        ? participation!.all.filter((n): n is number => typeof n === "number")
        : [],

      ownerProfile,

      fundingSources: buildFundingSources({
        owner,
        fundingUrl,
        hasSponsors,
      }),
    };

    // Land it in memory immediately so synchronous getters serve the fresh
    // copy without waiting for the Redis round-trip.
    cache.set(key, profile);

    // Best-effort Redis write. A failure here is logged but never throws —
    // the caller already has the in-memory copy and Redis will get the next
    // successful write within 30s.
    try {
      const { getDataStore } = await import("./data-store");
      const store = getDataStore();
      await store.write(payloadSlug(fullName), profile, {
        ttlSeconds: CACHE_TTL_SECONDS,
        writer: "repo-community-profile-live",
      });
    } catch (err) {
      console.warn(
        "[repo-community] data-store write skipped",
        fullName,
        err instanceof Error ? err.message : err,
      );
    }

    return profile;
  })().finally(() => {
    state.lastFetchMs = Date.now();
    state.inflight = null;
  });

  state.inflight = promise;
  liveFetchState.set(key, state);
  return promise;
}

/**
 * GitHub's `/repos/:owner/:name` payload exposes Sponsors via the
 * `has_sponsors` boolean on modern API versions. Older PATs may serve a
 * shape that omits the field; treat missing as "unknown → false" so we
 * don't lie about sponsorship availability.
 */
function hasGithubSponsorsFlag(repoBase: GitHubRepoApiResponse): boolean {
  const candidate = (repoBase as unknown as { has_sponsors?: unknown })
    .has_sponsors;
  return candidate === true;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Reset every per-process cache + dedupe slot. Test-only. */
export function _resetRepoCommunityProfileForTests(): void {
  cache.clear();
  refreshState.clear();
  liveFetchState.clear();
}

/** Direct seed for tests that don't want to mock the data-store. */
export function _seedRepoCommunityProfileForTests(
  fullName: string,
  profile: RepoCommunityProfile,
): void {
  cache.set(normalizeFullName(fullName), profile);
}
