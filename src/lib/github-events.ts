// App-side reader for the github-events firehose payloads written by the
// Railway worker (apps/trendingrepo-worker/src/fetchers/github-events).
//
// Slug shape:
//   github-events:_index           — watchlist roster (owner/name + numeric repoId + rank)
//   github-events:<numericRepoId>  — per-repo event slice (newest first, max 100)
//
// Pattern matches src/lib/trending.ts:refreshTrendingFromStore — async
// refresh hook with internal 30s rate-limit + in-flight dedupe, sync
// getters for the index, and a per-repo async read because we don't
// want to bake N=50 entries into a static module-level cache.

import { getDataStore, type DataReadResult } from "./data-store";

// ---------------------------------------------------------------------------
// Wire-format types — keep in lockstep with
// apps/trendingrepo-worker/src/fetchers/github-events/types.ts
// ---------------------------------------------------------------------------

export interface GithubEventActor {
  login: string;
  avatarUrl: string | null;
}

export interface NormalizedGithubEvent {
  id: string;
  type: string;
  actor: GithubEventActor;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface GithubEventsPayload {
  fetchedAt: string;
  repoId: number;
  fullName: string;
  eventCount: number;
  events: NormalizedGithubEvent[];
  etag: string | null;
}

export interface GithubEventsIndexEntry {
  repoId: number;
  fullName: string;
  rank: number;
}

export interface GithubEventsIndexPayload {
  fetchedAt: string;
  watchlistSize: number;
  repos: GithubEventsIndexEntry[];
}

export const GITHUB_EVENTS_INDEX_SLUG = "github-events:_index";

export function githubEventsRepoSlug(repoId: number): string {
  return `github-events:${repoId}`;
}

// ---------------------------------------------------------------------------
// Index cache — refreshed on demand. Per-repo slices stay un-cached and
// are read straight from the data-store on each route handler invocation
// because (a) each tick rewrites them and (b) the route's `ageSeconds`
// must reflect the actual write time, not a derived module cache.
// ---------------------------------------------------------------------------

interface RepoLookupEntry {
  repoId: number;
  fullName: string;
  rank: number;
}

interface IndexCache {
  payload: GithubEventsIndexPayload | null;
  byFullName: Map<string, RepoLookupEntry>;
  byRepoId: Map<number, RepoLookupEntry>;
  loadedAt: number;
}

const EMPTY_CACHE: IndexCache = {
  payload: null,
  byFullName: new Map(),
  byRepoId: new Map(),
  loadedAt: 0,
};

let indexCache: IndexCache = EMPTY_CACHE;
let inflight: Promise<RefreshResult> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000; // 30s — matches trending.ts

function buildIndexCache(payload: GithubEventsIndexPayload): IndexCache {
  const byFullName = new Map<string, RepoLookupEntry>();
  const byRepoId = new Map<number, RepoLookupEntry>();
  for (const repo of payload.repos ?? []) {
    if (!repo || typeof repo !== "object") continue;
    if (typeof repo.repoId !== "number" || !Number.isFinite(repo.repoId)) continue;
    if (typeof repo.fullName !== "string" || !repo.fullName.includes("/")) continue;
    const entry: RepoLookupEntry = {
      repoId: repo.repoId,
      fullName: repo.fullName,
      rank: typeof repo.rank === "number" ? repo.rank : 0,
    };
    byFullName.set(repo.fullName.toLowerCase(), entry);
    byRepoId.set(repo.repoId, entry);
  }
  return {
    payload,
    byFullName,
    byRepoId,
    loadedAt: Date.now(),
  };
}

export interface RefreshResult {
  source: "redis" | "file" | "memory" | "missing";
  ageMs: number;
  watchlistSize: number;
}

/**
 * Pull the freshest watchlist roster from the data-store and swap the
 * in-memory index. Cheap to call on every route request — internal dedupe
 * + 30s rate-limit ensure at most ~120 Redis reads/hr per Lambda for the
 * index slug.
 *
 * Never throws: on Redis miss the prior cache is preserved so the route
 * keeps returning whatever it last saw.
 */
export async function refreshGithubEventsIndexFromStore(): Promise<RefreshResult> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) {
    return {
      source: "memory",
      ageMs: sinceLast,
      watchlistSize: indexCache.payload?.watchlistSize ?? 0,
    };
  }

  inflight = (async (): Promise<RefreshResult> => {
    const store = getDataStore();
    const result = await store.read<GithubEventsIndexPayload>(GITHUB_EVENTS_INDEX_SLUG);
    if (result.data && result.source !== "missing") {
      indexCache = buildIndexCache(result.data);
    }
    lastRefreshMs = Date.now();
    return {
      source: result.source,
      ageMs: result.ageMs,
      watchlistSize: indexCache.payload?.watchlistSize ?? 0,
    };
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

// ---------------------------------------------------------------------------
// Sync getters for the index. Callers MUST call refreshGithubEventsIndexFromStore()
// once at the top of a server component / route handler before relying on
// these — the same pattern as trending.ts.
// ---------------------------------------------------------------------------

export function getGithubEventsIndex(): GithubEventsIndexPayload | null {
  return indexCache.payload;
}

export function getGithubEventsRepoByFullName(
  fullName: string,
): GithubEventsIndexEntry | null {
  const entry = indexCache.byFullName.get(fullName.toLowerCase());
  return entry ?? null;
}

export function getGithubEventsRepoByRepoId(repoId: number): GithubEventsIndexEntry | null {
  return indexCache.byRepoId.get(repoId) ?? null;
}

// ---------------------------------------------------------------------------
// Per-repo read — async, no module-level cache. Returns the data-store's
// full DataReadResult so callers can surface source/freshness in the wire
// response. Returns null payload when the slug is missing across every tier.
// ---------------------------------------------------------------------------

export async function readGithubEventsForRepo(
  repoId: number,
): Promise<DataReadResult<GithubEventsPayload>> {
  const store = getDataStore();
  return store.read<GithubEventsPayload>(githubEventsRepoSlug(repoId));
}

/**
 * Test/admin — drop the index cache so a fresh refreshGithubEventsIndexFromStore
 * call hits Redis instead of returning the memory tier.
 */
export function _resetGithubEventsCacheForTests(): void {
  indexCache = EMPTY_CACHE;
  inflight = null;
  lastRefreshMs = 0;
}
