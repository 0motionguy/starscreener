// Pure watchlist derivation for the github-events firehose.
//
// Walks the upstream slug chain in priority order:
//   1. engagement-composite  (Phase 3.1 sibling — may not exist yet)
//   2. trending              (OSS Insight; numeric repo_id is the GH databaseId)
//   3. repo-metadata         (top-N by stargazerCount)
//
// The first slug that contributes >= `target` distinct repos with a
// numeric GH ID wins. If none can fill `target`, we union them (keeping
// the highest-rank seen for each repo) so the worker still polls SOMETHING
// rather than going dark on cold start.
//
// All inputs are nullable / partial — every accessor is guarded so a
// malformed upstream payload degrades to an empty contribution rather
// than crashing the fetcher.

import type { GithubEventsIndexEntry } from './types.js';

// ---- Upstream payload shapes (loose) ---------------------------------------

interface EngagementCompositeItem {
  repoId?: number | string | null;
  repo_id?: number | string | null;
  fullName?: string | null;
  full_name?: string | null;
  rank?: number | string | null;
  score?: number | string | null;
}

interface EngagementCompositePayload {
  items?: EngagementCompositeItem[];
  rows?: EngagementCompositeItem[];
  /** Defensive — some pipelines wrap rows under `data`. */
  data?: { items?: EngagementCompositeItem[]; rows?: EngagementCompositeItem[] };
}

interface TrendingRow {
  repo_id?: string | number | null;
  repo_name?: string | null;
  stars?: string | number | null;
  total_score?: string | number | null;
}

interface TrendingPayload {
  buckets?: Record<string, Record<string, TrendingRow[]>>;
}

interface RepoMetadataItem {
  githubId?: number | null;
  fullName?: string | null;
  stars?: number | null;
}

interface RepoMetadataPayload {
  items?: RepoMetadataItem[];
}

// ---- Helpers ---------------------------------------------------------------

function toRepoId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function toFullName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.includes('/')) return null;
  return trimmed;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number.parseFloat(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

interface Candidate {
  repoId: number;
  fullName: string;
  /** Lower = better. Stable per upstream source so we can pick the best across sources. */
  rank: number;
}

/**
 * Internal: insert a candidate into the dedup map, keeping the lowest rank
 * (best signal) when the same repo is contributed by multiple sources.
 */
function upsertCandidate(map: Map<number, Candidate>, candidate: Candidate): void {
  const existing = map.get(candidate.repoId);
  if (!existing || candidate.rank < existing.rank) {
    map.set(candidate.repoId, candidate);
  }
}

// ---- Per-source extractors -------------------------------------------------

export function fromEngagementComposite(
  payload: EngagementCompositePayload | null | undefined,
): Candidate[] {
  const rows =
    payload?.items ?? payload?.rows ?? payload?.data?.items ?? payload?.data?.rows ?? [];
  if (!Array.isArray(rows)) return [];
  const out: Candidate[] = [];
  rows.forEach((row, idx) => {
    if (!row || typeof row !== 'object') return;
    const repoId = toRepoId(row.repoId ?? row.repo_id);
    const fullName = toFullName(row.fullName ?? row.full_name);
    if (!repoId || !fullName) return;
    // Trust an explicit rank when present; otherwise use array position.
    // Engagement composite is an explicitly-ranked feed so position is
    // meaningful even without a `rank` field.
    const explicitRank = toFiniteNumber(row.rank);
    const rank =
      explicitRank !== null && explicitRank > 0 ? explicitRank : idx + 1;
    out.push({ repoId, fullName, rank });
  });
  return out;
}

export function fromTrending(payload: TrendingPayload | null | undefined): Candidate[] {
  const buckets = payload?.buckets;
  if (!buckets || typeof buckets !== 'object') return [];
  // Aggregate every bucket — past_24_hours/All is the strongest single
  // signal but combining periods + languages gives broader coverage. We
  // dedup downstream and rank within source by best (lowest) per-bucket
  // position so the canonical "top trending" repos sort first.
  const byRepo = new Map<number, Candidate>();
  for (const langMap of Object.values(buckets)) {
    if (!langMap || typeof langMap !== 'object') continue;
    for (const rows of Object.values(langMap)) {
      if (!Array.isArray(rows)) continue;
      rows.forEach((row, idx) => {
        if (!row || typeof row !== 'object') return;
        const repoId = toRepoId(row.repo_id);
        const fullName = toFullName(row.repo_name);
        if (!repoId || !fullName) return;
        const candidate: Candidate = { repoId, fullName, rank: idx + 1 };
        const existing = byRepo.get(repoId);
        if (!existing || candidate.rank < existing.rank) {
          byRepo.set(repoId, candidate);
        }
      });
    }
  }
  return Array.from(byRepo.values()).sort((a, b) => a.rank - b.rank);
}

export function fromRepoMetadata(
  payload: RepoMetadataPayload | null | undefined,
): Candidate[] {
  const items = payload?.items;
  if (!Array.isArray(items)) return [];
  const candidates: Array<Candidate & { stars: number }> = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const repoId = toRepoId(item.githubId);
    const fullName = toFullName(item.fullName);
    if (!repoId || !fullName) continue;
    const stars = typeof item.stars === 'number' && Number.isFinite(item.stars) ? item.stars : 0;
    // Placeholder rank; replaced after we sort by stars below.
    candidates.push({ repoId, fullName, rank: 0, stars });
  }
  candidates.sort((a, b) => b.stars - a.stars);
  return candidates.map((c, idx) => ({ repoId: c.repoId, fullName: c.fullName, rank: idx + 1 }));
}

// ---- Top-level resolver ----------------------------------------------------

export interface DeriveWatchlistOptions {
  target: number;
  engagement?: EngagementCompositePayload | null;
  trending?: TrendingPayload | null;
  repoMetadata?: RepoMetadataPayload | null;
}

export interface DeriveWatchlistResult {
  /** Final watchlist (capped to `target`, sorted by rank ascending). */
  entries: GithubEventsIndexEntry[];
  /** Which upstream slug chain ended up driving the result. */
  drivers: Array<'engagement-composite' | 'trending' | 'repo-metadata'>;
  /** Which slugs returned at least one usable candidate. */
  available: Array<'engagement-composite' | 'trending' | 'repo-metadata'>;
}

/**
 * Top-N watchlist for the github-events firehose. Walks the priority chain
 * and returns as soon as we have `target` distinct repos. Falls back to
 * union-mode (keeping best rank seen for each repo) when no single source
 * can fill the target.
 */
export function deriveWatchlist(opts: DeriveWatchlistOptions): DeriveWatchlistResult {
  const target = Math.max(1, Math.trunc(opts.target));
  const engagement = fromEngagementComposite(opts.engagement);
  const trending = fromTrending(opts.trending);
  const repoMetadata = fromRepoMetadata(opts.repoMetadata);

  const available: DeriveWatchlistResult['available'] = [];
  if (engagement.length > 0) available.push('engagement-composite');
  if (trending.length > 0) available.push('trending');
  if (repoMetadata.length > 0) available.push('repo-metadata');

  // Try each source in priority order; first to fill `target` wins.
  for (const [name, candidates] of [
    ['engagement-composite', engagement] as const,
    ['trending', trending] as const,
    ['repo-metadata', repoMetadata] as const,
  ]) {
    if (candidates.length >= target) {
      const entries = candidates
        .slice(0, target)
        .map((c, idx) => ({ repoId: c.repoId, fullName: c.fullName, rank: idx + 1 }));
      return { entries, drivers: [name], available };
    }
  }

  // No single source filled the target — union them in priority order so
  // the higher-priority source's rank wins ties.
  const merged = new Map<number, Candidate>();
  const drivers: DeriveWatchlistResult['drivers'] = [];
  for (const [name, candidates] of [
    ['engagement-composite', engagement] as const,
    ['trending', trending] as const,
    ['repo-metadata', repoMetadata] as const,
  ]) {
    if (candidates.length === 0) continue;
    drivers.push(name);
    for (const c of candidates) upsertCandidate(merged, c);
    if (merged.size >= target) break;
  }

  const entries = Array.from(merged.values())
    .sort((a, b) => a.rank - b.rank)
    .slice(0, target)
    .map((c, idx) => ({ repoId: c.repoId, fullName: c.fullName, rank: idx + 1 }));

  return { entries, drivers, available };
}
