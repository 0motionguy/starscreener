// Per-repo editorial overview reader — reads `repo-editorial:{owner}__{name}`
// written by the worker's drop-deep-enrich-drain (LLM-written, citation-ready
// prose for a freshly-dropped repo). Read-only mirror of the per-repo cache +
// 30s-dedupe pattern in src/lib/repo-community-profile.ts; the page awaits
// refreshRepoEditorialFromStore(fullName) then reads getRepoEditorial(fullName).

import type { DataSource } from "./data-store";

export interface RepoEditorialCitation {
  title: string;
  url: string;
}

export interface RepoEditorial {
  fullName: string;
  computedAt: string;
  generator: string;
  model?: string;
  tagline?: string;
  overview: string;
  citations?: RepoEditorialCitation[];
}

const cache = new Map<string, RepoEditorial>();

interface RefreshState {
  inflight: Promise<RefreshOutcome> | null;
  lastRefreshMs: number;
}
const refreshState = new Map<string, RefreshState>();
const MIN_REFRESH_INTERVAL_MS = 30_000;

export interface RefreshOutcome {
  source: DataSource;
  ageMs: number;
}

function normalizeFullName(fullName: string): string {
  return fullName.toLowerCase();
}

function payloadSlug(fullName: string): string {
  return `repo-editorial:${normalizeFullName(fullName).replace("/", "__")}`;
}

function normalize(input: unknown): RepoEditorial | null {
  if (!input || typeof input !== "object") return null;
  const p = input as Partial<RepoEditorial>;
  if (typeof p.fullName !== "string") return null;
  if (typeof p.overview !== "string" || p.overview.trim().length === 0) return null;
  const citations = Array.isArray(p.citations)
    ? p.citations.filter(
        (c): c is RepoEditorialCitation =>
          !!c &&
          typeof (c as RepoEditorialCitation).title === "string" &&
          typeof (c as RepoEditorialCitation).url === "string",
      )
    : undefined;
  return {
    fullName: p.fullName,
    computedAt: typeof p.computedAt === "string" ? p.computedAt : "",
    generator: typeof p.generator === "string" ? p.generator : "template",
    model: typeof p.model === "string" ? p.model : undefined,
    tagline: typeof p.tagline === "string" && p.tagline.trim() ? p.tagline : undefined,
    overview: p.overview,
    citations: citations && citations.length > 0 ? citations : undefined,
  };
}

/** Synchronous getter — null until a successful refresh for this fullName. */
export function getRepoEditorial(fullName: string): RepoEditorial | null {
  return cache.get(normalizeFullName(fullName)) ?? null;
}

/**
 * Pull the editorial overview for `fullName` from the data-store into the
 * in-memory cache. Per-repo 30s rate-limit + in-flight dedupe; never throws.
 */
export async function refreshRepoEditorialFromStore(
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
    const result = await store.read<unknown>(payloadSlug(fullName));
    if (result.data && result.source !== "missing") {
      const normalized = normalize(result.data);
      if (normalized) cache.set(key, normalized);
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

/** Reset every per-process cache + dedupe slot. Test-only. */
export function _resetRepoEditorialForTests(): void {
  cache.clear();
  refreshState.clear();
}
