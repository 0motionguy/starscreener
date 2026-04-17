// StarScreener Pipeline — snapshot creation & backfill
//
// Converts a Repo into a RepoSnapshot at a given moment, and can synthesize
// 30 backdated snapshots from a sparkline so the rest of the pipeline has
// something to compute deltas against before real ingestion is live.

import type { Repo } from "../../types";
import type { RepoSnapshot, SnapshotStore } from "../types";
import { emitPipelineEvent } from "../events";

const ONE_DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Pure snapshot creation
// ---------------------------------------------------------------------------

/**
 * Build a RepoSnapshot from a Repo object. Caller is responsible for
 * persisting via snapshotStore.append().
 */
export function takeSnapshot(
  repo: Repo,
  source: "github" | "mock" = "mock",
): RepoSnapshot {
  const capturedAt = new Date().toISOString();
  return buildSnapshot(repo, capturedAt, source);
}

function buildSnapshot(
  repo: Repo,
  capturedAt: string,
  source: "github" | "mock",
  /** Optional override for stars at this point in time (used by backfill). */
  starsOverride?: number,
): RepoSnapshot {
  const stars = starsOverride ?? repo.stars;
  return {
    id: `${repo.id}:${capturedAt}`,
    repoId: repo.id,
    capturedAt,
    source,
    stars,
    forks: repo.forks,
    openIssues: repo.openIssues,
    // The base Repo type does not carry a watcher count; fall back to stars.
    watchers: repo.stars,
    contributors: repo.contributors,
    // Size is not tracked on the public Repo; 0 is an acceptable placeholder.
    sizeKb: 0,
    lastCommitAt: repo.lastCommitAt ?? null,
    lastReleaseAt: repo.lastReleaseAt ?? null,
    lastReleaseTag: repo.lastReleaseTag ?? null,
    mentionCount24h: repo.mentionCount24h,
    socialBuzzScore: repo.socialBuzzScore,
  };
}

// ---------------------------------------------------------------------------
// Persist helpers
// ---------------------------------------------------------------------------

/** Take a snapshot and append it to the given store in one call. */
export function snapshotAndPersist(
  repo: Repo,
  snapshotStore: SnapshotStore,
  source: "github" | "mock" = "mock",
): RepoSnapshot {
  const snap = takeSnapshot(repo, source);
  snapshotStore.append(snap);
  emitPipelineEvent({
    type: "snapshot_captured",
    at: snap.capturedAt,
    repoId: repo.id,
    fullName: repo.fullName,
    stars: snap.stars,
    starsDelta24h: repo.starsDelta24h ?? null,
  });
  return snap;
}

/**
 * Backfill 30 daily snapshots for a repo from its sparkline, oldest-first
 * (so the store ends up with the current day last). This lets the delta
 * engine compute 24h/7d/30d changes against synthetic history before any
 * real ingestion has happened.
 *
 * - sparklineData[29] is treated as "today".
 * - sparklineData[0] is "29 days ago".
 * - Every synthetic snapshot uses the current values for all non-star
 *   metrics (fine for MVP).
 */
/**
 * Derive a sparklineData array from the snapshot store for a given repo.
 * Returns `days` cumulative star counts, oldest first (index 0 = oldest day,
 * index days-1 = today). For each day bucket, uses the latest snapshot
 * captured on or before that day's end. Days with no snapshot carry forward
 * the previous day's value (or 0 at the start).
 */
export function deriveSparklineData(
  repoId: string,
  snapshotStore: SnapshotStore,
  days: number = 30,
): number[] {
  const now = Date.now();
  const today = new Date(now);
  today.setUTCHours(23, 59, 59, 999);
  const out: number[] = new Array(days).fill(0);
  let lastKnown = 0;
  for (let i = 0; i < days; i++) {
    const daysAgo = days - 1 - i;
    const dayEnd = new Date(today.getTime() - daysAgo * ONE_DAY_MS);
    const snap = snapshotStore.getAt(repoId, dayEnd.toISOString());
    if (snap) lastKnown = snap.stars;
    out[i] = lastKnown;
  }
  return out;
}

export function backfillSnapshots(
  repo: Repo,
  sparklineData: number[],
  snapshotStore: SnapshotStore,
): RepoSnapshot[] {
  const now = Date.now();
  const snapshots: RepoSnapshot[] = [];
  const len = sparklineData.length;
  if (len === 0) return snapshots;

  // Iterate oldest -> newest so append() ordering is natural.
  for (let i = 0; i < len; i++) {
    // daysAgo: len-1-i days ago. For len=30 this yields 29..0.
    const daysAgo = len - 1 - i;
    const capturedAt = new Date(now - daysAgo * ONE_DAY_MS).toISOString();
    const stars = sparklineData[i];
    const snap = buildSnapshot(repo, capturedAt, "mock", stars);
    snapshotStore.append(snap);
    snapshots.push(snap);
  }

  return snapshots;
}
