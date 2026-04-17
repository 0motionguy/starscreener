// StarScreener Pipeline — snapshot delta engine
//
// Given a SnapshotStore full of point-in-time captures, compute the change
// in key metrics between the latest snapshot and the snapshot at or before
// (now - windowDuration). Also provides a helper to stamp the computed
// deltas back onto a Repo object so the UI layer keeps its existing shape.

import type { Repo } from "../../types";
import type { RepoSnapshot, SnapshotDelta, SnapshotStore } from "../types";

// ---------------------------------------------------------------------------
// Window durations (ms)
// ---------------------------------------------------------------------------

export const WINDOW_MS_24H = 86_400_000;
export const WINDOW_MS_7D = 604_800_000;
export const WINDOW_MS_30D = 2_592_000_000;

export type DeltaWindow = "24h" | "7d" | "30d";

const WINDOW_DURATIONS: Record<DeltaWindow, number> = {
  "24h": WINDOW_MS_24H,
  "7d": WINDOW_MS_7D,
  "30d": WINDOW_MS_30D,
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function pctChange(fromVal: number, toVal: number): number {
  if (fromVal === 0) {
    if (toVal === 0) return 0;
    return toVal > 0 ? 100 : -100;
  }
  return ((toVal - fromVal) / fromVal) * 100;
}

function computePair(
  repoId: string,
  window: DeltaWindow,
  from: RepoSnapshot,
  to: RepoSnapshot,
): SnapshotDelta {
  const starsDelta = to.stars - from.stars;
  const forksDelta = to.forks - from.forks;
  const contributorsDelta = to.contributors - from.contributors;
  const issuesDelta = to.openIssues - from.openIssues;
  const watchersDelta = to.watchers - from.watchers;

  let releaseShippedInWindow = false;
  if (to.lastReleaseAt) {
    if (!from.lastReleaseAt) {
      releaseShippedInWindow = true;
    } else if (from.lastReleaseAt !== to.lastReleaseAt && to.lastReleaseAt > from.lastReleaseAt) {
      releaseShippedInWindow = true;
    }
  }

  return {
    repoId,
    window,
    fromAt: from.capturedAt,
    toAt: to.capturedAt,
    starsDelta,
    starsPercent: Number(pctChange(from.stars, to.stars).toFixed(2)),
    forksDelta,
    forksPercent: Number(pctChange(from.forks, to.forks).toFixed(2)),
    contributorsDelta,
    issuesDelta,
    watchersDelta,
    releaseShippedInWindow,
    // commitsInWindow requires the GitHub commits API; snapshots alone can't
    // derive it. Return 0 for MVP — the adapter layer will fill this in later.
    commitsInWindow: 0,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the delta for a single window. Returns null when either the
 * latest snapshot or a snapshot at/before (now - window) is missing.
 */
export function computeDelta(
  repoId: string,
  window: DeltaWindow,
  snapshotStore: SnapshotStore,
): SnapshotDelta | null {
  const to = snapshotStore.getLatest(repoId);
  if (!to) return null;

  const windowMs = WINDOW_DURATIONS[window];
  const toMs = Date.parse(to.capturedAt);
  if (Number.isNaN(toMs)) return null;

  const cutoffIso = new Date(toMs - windowMs).toISOString();
  const from = snapshotStore.getAt(repoId, cutoffIso);
  if (!from) return null;
  if (from.id === to.id) return null;

  return computePair(repoId, window, from, to);
}

/** Compute all three standard windows at once. */
export function computeAllDeltas(
  repoId: string,
  snapshotStore: SnapshotStore,
): {
  window24h: SnapshotDelta | null;
  window7d: SnapshotDelta | null;
  window30d: SnapshotDelta | null;
} {
  return {
    window24h: computeDelta(repoId, "24h", snapshotStore),
    window7d: computeDelta(repoId, "7d", snapshotStore),
    window30d: computeDelta(repoId, "30d", snapshotStore),
  };
}

/**
 * Produce a new Repo with its delta fields populated from the computed
 * SnapshotDelta triple. Any missing delta leaves the existing repo value
 * in place (so seeded mock values remain the fallback).
 */
export function applyDeltasToRepo(
  repo: Repo,
  deltas: {
    window24h: SnapshotDelta | null;
    window7d: SnapshotDelta | null;
    window30d: SnapshotDelta | null;
  },
): Repo {
  return {
    ...repo,
    starsDelta24h: deltas.window24h?.starsDelta ?? repo.starsDelta24h,
    starsDelta7d: deltas.window7d?.starsDelta ?? repo.starsDelta7d,
    starsDelta30d: deltas.window30d?.starsDelta ?? repo.starsDelta30d,
    forksDelta7d: deltas.window7d?.forksDelta ?? repo.forksDelta7d,
    contributorsDelta30d:
      deltas.window30d?.contributorsDelta ?? repo.contributorsDelta30d,
  };
}
