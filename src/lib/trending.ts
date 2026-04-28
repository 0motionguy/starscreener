// Trending + deltas loader.
//
// Phase 1 replaced src/lib/seed-repos.ts with data/trending.json as the
// discovery source. Phase 3 adds data/deltas.json (computed in GHA from
// git history of trending.json) as the delta source, replacing the
// Vercel-Lambda-ephemeral snapshot pipeline.
//
// Phase 4 (data-API): the bundled JSON files are now a cold-start SEED
// only. The live source of truth is Redis (via src/lib/data-store). At
// module init the cache is the bundled snapshot; server components call
// `refreshTrendingFromStore()` before rendering to pull the fresh payload.
// Sync getters keep their existing signatures so 30+ callers don't have to
// change in lockstep — they read whatever's in the in-memory cache, which
// is updated by the refresh hook.

import trending from "../../data/trending.json";
import deltasData from "../../data/deltas.json";
import type { Repo } from "./types";

export type TrendingPeriod = "past_24_hours" | "past_week" | "past_month";
export type TrendingLanguage = "All" | "Python" | "TypeScript" | "Rust" | "Go";

// OSS Insight returns all numeric columns as strings. We preserve the raw
// shape here; callers that need numbers should parse at the boundary.
export interface TrendingRow {
  repo_id: string;
  repo_name: string; // "owner/name"
  primary_language: string;
  description: string;
  stars: string;
  forks: string;
  pull_requests: string;
  pushes: string;
  total_score: string;
  contributor_logins: string;
  collection_names: string;
}

interface TrendingFile {
  fetchedAt: string;
  buckets: Record<TrendingPeriod, Record<TrendingLanguage, TrendingRow[]>>;
}

// Mutable in-memory cache. Seeded from the bundled JSON; replaced by Redis
// payloads via refreshTrendingFromStore(). Sync getters below all read this.
let data: TrendingFile = trending as unknown as TrendingFile;

// Public read of "when was the in-memory snapshot last produced".
// Updated whenever refreshTrendingFromStore() succeeds with fresher Redis data.
export function getLastFetchedAt(): string {
  return data.fetchedAt;
}

// Backwards-compat: callers that imported `lastFetchedAt` as a constant
// keep working — the value reflects whatever the cache held at THEIR import
// time. New callers should use getLastFetchedAt() to see post-refresh values.
export const lastFetchedAt: string = data.fetchedAt;

export function getTrending(
  period: TrendingPeriod,
  language: TrendingLanguage,
): TrendingRow[] {
  return data.buckets[period]?.[language] ?? [];
}

/**
 * Flatten every bucket into a deduped `owner/name[]`. Used by the ingestion
 * seed path as the replacement for the old SEED_REPOS allowlist.
 */
export function getAllFullNames(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const langMap of Object.values(data.buckets)) {
    for (const rows of Object.values(langMap)) {
      for (const row of rows) {
        const name = row.repo_name;
        // OSS Insight occasionally returns non-owner/name shapes; guard.
        if (!name || !name.includes("/")) continue;
        if (seen.has(name)) continue;
        seen.add(name);
        out.push(name);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Phase 3: deltas from git history of data/trending.json.
// ---------------------------------------------------------------------------

export type DeltaWindowKey = "1h" | "24h" | "7d" | "30d";

export type DeltaValue =
  | { value: number; basis: "exact" | "nearest"; from_commit: string; from_ts: number }
  | { value: number; basis: "cold-start"; from_commit: string; from_ts: number; age_seconds: number }
  | { value: null; basis: "no-history" }
  | { value: null; basis: "repo-not-tracked" };

export interface DeltaCoverageSummary {
  exact: number;
  nearest: number;
  "cold-start": number;
  "no-history": number;
  "repo-not-tracked": number;
}

export interface RepoDeltaEntry {
  stars_now: number;
  delta_1h: DeltaValue;
  delta_24h: DeltaValue;
  delta_7d: DeltaValue;
  delta_30d: DeltaValue;
}

export interface WindowPick {
  target_ts: number;
  buffer_s: number;
  picked_commit: string;
  picked_ts: number;
  offset_s: number;
  basis: "exact" | "nearest" | "cold-start";
  /** Seconds since now for the picked commit. Present only when basis === 'cold-start'. */
  age_seconds?: number;
}

export interface DeltasJson {
  computedAt: string;
  windows: Record<DeltaWindowKey, WindowPick | null>;
  /** Aggregate basis counts across all windows. Missing on pre-Phase-3.1 files. */
  coverage?: DeltaCoverageSummary;
  repos: Record<string, RepoDeltaEntry>;
}

// Same mutable-seed pattern as `data` above.
let deltas: DeltasJson = deltasData as unknown as DeltasJson;

export function getDeltasComputedAt(): string {
  return deltas.computedAt;
}

export const deltasComputedAt: string = deltas.computedAt;

export function getDeltas(): DeltasJson {
  return deltas;
}

// Cache: owner/name → OSS Insight repo_id. Rebuilt whenever the underlying
// trending payload is replaced via refreshTrendingFromStore().
let _fullNameToRepoId: Map<string, string> | null = null;
function fullNameIndex(): Map<string, string> {
  if (_fullNameToRepoId) return _fullNameToRepoId;
  const map = new Map<string, string>();
  for (const langMap of Object.values(data.buckets)) {
    for (const rows of Object.values(langMap)) {
      for (const row of rows) {
        if (!row.repo_name || !row.repo_id) continue;
        if (!map.has(row.repo_name)) map.set(row.repo_name, row.repo_id);
      }
    }
  }
  _fullNameToRepoId = map;
  return map;
}

// ---------------------------------------------------------------------------
// Refresh hook — pulls fresh trending + deltas from the data-store.
// ---------------------------------------------------------------------------

interface RefreshResult {
  trending: { source: "redis" | "file" | "memory" | "missing"; ageMs: number };
  deltas: { source: "redis" | "file" | "memory" | "missing"; ageMs: number };
}

// In-flight dedupe so a burst of concurrent server-component renders doesn't
// fan out N parallel Redis calls. The first request kicks the fetch; the
// rest await the same promise.
let inflight: Promise<RefreshResult> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000; // 30s — at most ~120 refreshes/hr per Lambda

/**
 * Pull the freshest trending + deltas payloads from the data-store and swap
 * them into the in-memory cache. Cheap to call multiple times — internal
 * dedupe + rate-limit ensure we hit Redis at most once per 30s per process.
 *
 * Safe to call from any server-component / route handler before reading any
 * sync getter. Never throws — on Redis miss the existing cache is preserved.
 */
export async function refreshTrendingFromStore(): Promise<RefreshResult> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) {
    return {
      trending: { source: "memory", ageMs: sinceLast },
      deltas: { source: "memory", ageMs: sinceLast },
    };
  }

  inflight = (async (): Promise<RefreshResult> => {
    const { getDataStore } = await import("./data-store");
    const store = getDataStore();
    const [trendingResult, deltasResult] = await Promise.all([
      store.read<TrendingFile>("trending"),
      store.read<DeltasJson>("deltas"),
    ]);

    if (trendingResult.data && trendingResult.source !== "missing") {
      // Only swap if we got something real — never blank out the seed.
      data = trendingResult.data;
      _fullNameToRepoId = null; // invalidate derived index
    }
    if (deltasResult.data && deltasResult.source !== "missing") {
      deltas = deltasResult.data;
    }

    lastRefreshMs = Date.now();
    return {
      trending: {
        source: trendingResult.source,
        ageMs: trendingResult.ageMs,
      },
      deltas: { source: deltasResult.source, ageMs: deltasResult.ageMs },
    };
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

/**
 * Test/admin — reset the in-memory cache to the bundled seed. Lets tests
 * exercise the refresh path without leaking state across cases.
 */
export function _resetTrendingCacheForTests(): void {
  data = trending as unknown as TrendingFile;
  deltas = deltasData as unknown as DeltasJson;
  _fullNameToRepoId = null;
  lastRefreshMs = 0;
  inflight = null;
}

/** Count of repos in deltas.json that have at least one non-null delta. */
export function deltasCoveragePct(): number {
  const repos = deltas.repos ?? {};
  const total = Object.keys(repos).length;
  if (total === 0) return 0;
  let covered = 0;
  for (const entry of Object.values(repos)) {
    if (
      entry.delta_1h.value !== null ||
      entry.delta_24h.value !== null ||
      entry.delta_7d.value !== null ||
      entry.delta_30d.value !== null
    ) {
      covered += 1;
    }
  }
  return (covered * 100) / total;
}

export type DeltaCoverageQuality = "full" | "partial" | "cold";

/**
 * Classify overall delta coverage health in one token:
 *   'full'    → majority of delta slots are exact+nearest (>50%). Real deltas.
 *   'partial' → cold-start dominates. System is warming up; data is diagnostic.
 *   'cold'    → every slot is no-history. Barely any data yet.
 */
export function deltasCoverageQuality(): DeltaCoverageQuality {
  const c = deltas.coverage;
  if (!c) {
    // Pre-Phase-3.1 deltas.json without coverage summary — derive from
    // windows[] basis tags as a rough proxy.
    const windowBases = Object.values(deltas.windows)
      .filter((w): w is WindowPick => w !== null)
      .map((w) => w.basis);
    if (windowBases.length === 0) return "cold";
    const good = windowBases.filter((b) => b === "exact" || b === "nearest").length;
    if (good / windowBases.length > 0.5) return "full";
    if (windowBases.includes("cold-start")) return "partial";
    return "cold";
  }
  const total = c.exact + c.nearest + c["cold-start"] + c["no-history"] + c["repo-not-tracked"];
  if (total === 0) return "cold";
  const good = c.exact + c.nearest;
  if (good / total > 0.5) return "full";
  if (c["cold-start"] > 0) return "partial";
  return "cold";
}

// ---------------------------------------------------------------------------
// JSON-derived stats / mover helpers — used by surfaces that need real
// numbers without going through the in-memory pipeline (which is empty on
// cold Vercel Lambdas). Phase 3's "compute at the boundary" pattern.
// ---------------------------------------------------------------------------

/** Total unique tracked repos = unique owner/name set across all trending buckets. */
export function getTrackedRepoCount(): number {
  return getAllFullNames().length;
}

/** Sum of stars_now across every repo in deltas.json. Ignores repos absent from deltas. */
export function getTotalStars(): number {
  let total = 0;
  for (const entry of Object.values(deltas.repos)) {
    total += entry.stars_now;
  }
  return total;
}

export interface TrendingTopMover {
  id: string;
  fullName: string;
  language: string | null;
  starsDelta24h: number;
}

/**
 * Top N repos sorted by OSS Insight's past_24_hours star activity. This is
 * the immediate trend signal used by public OG surfaces; git-history deltas
 * remain available for freshness diagnostics, but cold-start history must not
 * hide the source feed's own 24h ranking.
 */
export function getTopMoversByDelta24h(limit: number): TrendingTopMover[] {
  if (limit <= 0) return [];
  const byRepo = new Map<string, TrendingTopMover>();
  const languages: TrendingLanguage[] = ["All", "Python", "TypeScript", "Rust", "Go"];

  for (const language of languages) {
    for (const row of getTrending("past_24_hours", language)) {
      if (!row.repo_id || !row.repo_name) continue;
      const stars = Number.parseInt(row.stars ?? "0", 10);
      if (!Number.isFinite(stars)) continue;
      const previous = byRepo.get(row.repo_id);
      if (!previous || stars > previous.starsDelta24h) {
        byRepo.set(row.repo_id, {
          id: row.repo_id,
          fullName: row.repo_name,
          language: row.primary_language || null,
          starsDelta24h: stars,
        });
      }
    }
  }
  const movers = Array.from(byRepo.values());
  movers.sort((a, b) => b.starsDelta24h - a.starsDelta24h);
  return movers.slice(0, limit);
}

/**
 * Project the delta values for this repo onto a fresh Repo copy. Replaces
 * the previous `applyDeltasToRepo(repo, computeAllDeltas(...))` pair which
 * relied on the ephemeral in-memory snapshot store.
 *
 * Null deltas are shimmed to 0 so the existing scoring/UI code paths —
 * which type the delta fields as plain `number` — keep working. The
 * accompanying `*Missing` flags let the classifier distinguish "we didn't
 * see movement" (value: 0) from "we don't know yet" (value: 0, missing:
 * true) during cold-start and for repos that weren't in the historical
 * snapshot.
 */
export function assembleRepoFromTrending(repo: Repo, d: DeltasJson): Repo {
  const repoId = fullNameIndex().get(repo.fullName);
  const entry = repoId ? d.repos[repoId] : undefined;

  // Prefer current delta values from the new source; fall back to existing
  // repo values only when no entry exists at all (so we don't zero-out a
  // prior snapshot pipeline's numbers in dev environments before the first
  // scrape lands).
  if (!entry) {
    return { ...repo, hasMovementData: false };
  }

  // Cold-start values are real partial-window numbers in deltas.json (useful
  // for diagnostics and future classifier gating), but we project them as
  // {value: 0, missing: true} onto Repo so scoring / breakout / hot
  // detection don't fire on warm-up noise. Upgrades naturally once a window
  // resolves to exact/nearest.
  const take = (v: DeltaValue): { value: number; missing: boolean } => {
    if (v.value === null) return { value: 0, missing: true };
    if (v.basis === "cold-start") return { value: 0, missing: true };
    return { value: v.value, missing: false };
  };

  const d1 = take(entry.delta_1h);
  const d24 = take(entry.delta_24h);
  const d7 = take(entry.delta_7d);
  const d30 = take(entry.delta_30d);

  // starsDelta24h: use the 1h window as a stand-in only if 24h is missing
  // AND 1h has a real value — otherwise honor the 24h shim so downstream
  // filters don't conflate hourly churn with 24h movement.
  const starsDelta24h = d24.missing && !d1.missing ? d1.value : d24.value;
  const starsDelta24hMissing = d24.missing && d1.missing;

  const hasMovementData = !(d1.missing && d24.missing && d7.missing && d30.missing);

  return {
    ...repo,
    starsDelta24h,
    starsDelta7d: d7.value,
    starsDelta30d: d30.value,
    // OSS Insight trending rows don't carry fork or contributor deltas —
    // those metrics stay shimmed at 0 with their *Missing flag set. Once a
    // future scrape captures them, this adapter picks them up automatically.
    forksDelta7d: 0,
    contributorsDelta30d: 0,
    hasMovementData,
    starsDelta24hMissing,
    starsDelta7dMissing: d7.missing,
    starsDelta30dMissing: d30.missing,
    forksDelta7dMissing: true,
    contributorsDelta30dMissing: true,
  };
}
