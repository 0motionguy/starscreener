// StarScreener Pipeline — query service layer
//
// The single source of truth for every read the UI, MCP, CLI, or HTTP API
// needs. All functions are pure over the singleton stores — no mutation,
// no I/O. Seeding is guaranteed by the pipeline facade before any of these
// functions is invoked.

import type { Repo } from "../../types";
import { slugToId } from "../../utils";
import {
  categoryStore,
  mentionStore,
  reasonStore,
  repoStore,
  scoreStore,
  snapshotStore,
} from "../storage/singleton";
import type {
  CompareRepoMetrics,
  CompareResult,
  ReasonCode,
  RepoSummary,
  TrendFilter,
  TrendWindow,
} from "../types";

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Internal sort helpers
// ---------------------------------------------------------------------------

function deltaForWindow(repo: Repo, window: TrendWindow): number {
  switch (window) {
    case "today":
      return repo.starsDelta24h;
    case "week":
      return repo.starsDelta7d;
    case "month":
      return repo.starsDelta30d;
  }
}

function sortByWindowDesc(repos: Repo[], window: TrendWindow): Repo[] {
  return repos
    .slice()
    .sort((a, b) => deltaForWindow(b, window) - deltaForWindow(a, window));
}

function applyTrendFilter(repos: Repo[], filter: TrendFilter): Repo[] {
  if (filter === "all") return repos;
  if (filter === "breakouts") {
    return repos.filter((r) => r.movementStatus === "breakout");
  }
  if (filter === "quiet-killers") {
    return repos.filter((r) => r.movementStatus === "quiet_killer");
  }
  if (filter === "hot") {
    return repos.filter((r) => r.movementStatus === "hot");
  }
  if (filter === "new-under-30d") {
    const now = Date.now();
    return repos.filter((r) => {
      const created = Date.parse(r.createdAt);
      if (!Number.isFinite(created)) return false;
      return now - created < 30 * MS_PER_DAY;
    });
  }
  if (filter === "under-1k-stars") {
    return repos.filter((r) => r.stars < 1000);
  }
  return repos;
}

// ---------------------------------------------------------------------------
// Public query functions
// ---------------------------------------------------------------------------

/** Top movers for a given time window, optionally narrowed by a preset filter. */
export function getTopMovers(
  window: TrendWindow,
  limit = 25,
  filter: TrendFilter = "all",
): Repo[] {
  const all = repoStore.getAll();
  const filtered = applyTrendFilter(all, filter);
  const sorted = sortByWindowDesc(filtered, window);
  return sorted.slice(0, Math.max(0, limit));
}

/** Top movers inside a single category. */
export function getCategoryMovers(
  categoryId: string,
  window: TrendWindow,
  limit = 25,
): Repo[] {
  const inCat = repoStore
    .getAll()
    .filter((r) => r.categoryId === categoryId);
  const sorted = sortByWindowDesc(inCat, window);
  return sorted.slice(0, Math.max(0, limit));
}

/**
 * All repos in a category, sorted by momentum desc. Not windowed — this is
 * the full set, which the terminal layout narrows further with its own
 * filter/sort pipeline.
 */
export function getReposByCategory(categoryId: string): Repo[] {
  return repoStore
    .getAll()
    .filter((r) => r.categoryId === categoryId)
    .sort((a, b) => b.momentumScore - a.momentumScore);
}

/** Repos currently classified as breakouts, sorted by momentum desc. */
export function getBreakouts(limit = 10): Repo[] {
  return repoStore
    .getAll()
    .filter((r) => r.movementStatus === "breakout")
    .sort((a, b) => b.momentumScore - a.momentumScore)
    .slice(0, Math.max(0, limit));
}

/** Quiet killers — steady sustained growth, no single spike. */
export function getQuietKillers(limit = 10): Repo[] {
  return repoStore
    .getAll()
    .filter((r) => r.movementStatus === "quiet_killer")
    .sort((a, b) => b.momentumScore - a.momentumScore)
    .slice(0, Math.max(0, limit));
}

/** Most-discussed repos in the last 24h (by mention count). Skips 0s. */
export function getMostDiscussed(limit = 10): Repo[] {
  return repoStore
    .getAll()
    .filter((r) => r.mentionCount24h > 0)
    .sort((a, b) => b.mentionCount24h - a.mentionCount24h)
    .slice(0, Math.max(0, limit));
}

/** Recently-created repos (within `maxAgeDays`), sorted by momentum desc. */
export function getNewRepos(limit = 10, maxAgeDays = 30): Repo[] {
  const now = Date.now();
  const cutoff = now - maxAgeDays * MS_PER_DAY;
  return repoStore
    .getAll()
    .filter((r) => {
      const created = Date.parse(r.createdAt);
      if (!Number.isFinite(created)) return false;
      return created >= cutoff;
    })
    .sort((a, b) => b.momentumScore - a.momentumScore)
    .slice(0, Math.max(0, limit));
}

/**
 * Get a full summary for a single repo: the Repo, its score, its category
 * classification, its reason stack, its social aggregate, and the latest
 * snapshot timestamp. Accepts either "owner/name" or a slug id.
 */
export function getRepoSummary(fullName: string): RepoSummary | null {
  // Try fullName lookup first (handles dotted names exactly).
  let repo = repoStore.getByFullName(fullName);
  if (!repo) {
    // Fallback: slug-id lookup. Handles cases where the caller already
    // normalized the name or passed a slug directly.
    const id = slugToId(fullName);
    repo = repoStore.get(id);
  }
  if (!repo) return null;

  const score = scoreStore.get(repo.id);
  if (!score) return null;

  const category = categoryStore.get(repo.id) ?? null;
  const reasons = reasonStore.get(repo.id) ?? null;
  const social = mentionStore.aggregateForRepo(repo.id) ?? null;

  const latestSnapshot = snapshotStore.getLatest(repo.id);
  const lastSnapshotAt = latestSnapshot?.capturedAt ?? new Date().toISOString();

  return {
    repo,
    score,
    category,
    reasons,
    social,
    lastSnapshotAt,
  };
}

/**
 * Get comparable metrics for multiple repos side-by-side. Silently drops
 * any repoIds that don't resolve (the caller gets back only the repos that
 * exist).
 */
export function getRepoCompare(repoIds: string[]): CompareResult {
  const metrics: CompareRepoMetrics[] = [];

  for (const repoId of repoIds) {
    const repo = repoStore.get(repoId);
    if (!repo) continue;
    const score = scoreStore.get(repoId);
    if (!score) continue;

    // Pull the 30 most recent snapshots (newest first) and reverse so the
    // resulting arrays read left-to-right as oldest → newest, which charts
    // expect.
    const snaps = snapshotStore.list(repoId, 30).slice().reverse();
    const starHistory = snaps.map((s) => s.stars);
    const forkHistory = snaps.map((s) => s.forks);

    const reasonBundle = reasonStore.get(repoId);
    const reasons: ReasonCode[] = reasonBundle?.codes ?? [];

    metrics.push({
      repo,
      score,
      starHistory,
      forkHistory,
      reasons,
    });
  }

  // Winner determination — the caller gets the repoId whose metric is
  // highest in each category. Defensive default = first repo's id, or
  // empty string when the compare set is empty.
  const defaultId = metrics[0]?.repo.id ?? "";
  const winners = {
    momentum: pickWinner(metrics, (m) => m.score.overall) ?? defaultId,
    stars: pickWinner(metrics, (m) => m.repo.stars) ?? defaultId,
    growth7d: pickWinner(metrics, (m) => m.repo.starsDelta7d) ?? defaultId,
    contributors: pickWinner(metrics, (m) => m.repo.contributors) ?? defaultId,
    freshness:
      pickWinner(metrics, (m) => {
        const t = Date.parse(m.repo.lastCommitAt);
        return Number.isFinite(t) ? t : -Infinity;
      }) ?? defaultId,
  };

  return { repos: metrics, winners };
}

function pickWinner(
  metrics: CompareRepoMetrics[],
  getValue: (m: CompareRepoMetrics) => number,
): string | null {
  if (metrics.length === 0) return null;
  let best = metrics[0];
  let bestValue = getValue(best);
  for (let i = 1; i < metrics.length; i++) {
    const v = getValue(metrics[i]);
    if (v > bestValue) {
      best = metrics[i];
      bestValue = v;
    }
  }
  return best.repo.id;
}

/**
 * Repos in the same category as the source repo, sorted by momentum desc,
 * excluding the source itself.
 */
export function getRelatedRepos(repoId: string, limit = 6): Repo[] {
  const source = repoStore.get(repoId);
  if (!source) return [];
  return repoStore
    .getAll()
    .filter((r) => r.id !== repoId && r.categoryId === source.categoryId)
    .sort((a, b) => b.momentumScore - a.momentumScore)
    .slice(0, Math.max(0, limit));
}

/**
 * Free-text search across repos. Case-insensitive substring match on
 * fullName, description, and topics. Optional category filter, optional
 * limit, sorted by momentum desc.
 */
export function searchReposByQuery(
  query: string,
  options?: { categoryId?: string; limit?: number },
): Repo[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const categoryId = options?.categoryId;
  const limit = options?.limit;

  const matches = repoStore.getAll().filter((r) => {
    if (categoryId && r.categoryId !== categoryId) return false;
    if (r.fullName.toLowerCase().includes(q)) return true;
    if ((r.description ?? "").toLowerCase().includes(q)) return true;
    for (const topic of r.topics ?? []) {
      if (topic.toLowerCase().includes(q)) return true;
    }
    return false;
  });

  matches.sort((a, b) => b.momentumScore - a.momentumScore);

  if (limit !== undefined) {
    return matches.slice(0, Math.max(0, limit));
  }
  return matches;
}
