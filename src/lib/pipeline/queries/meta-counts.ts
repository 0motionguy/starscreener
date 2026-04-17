// StarScreener Pipeline — metas bar counts + helpers
//
// Drives the sticky filter bar's 7 meta pills (Hot / Breakouts / Quiet
// Killers / New / Discussed / Rank Climbers / Fresh Releases). Also exposes
// the underlying Repo lists for the rank-climbers and fresh-releases
// sections — both prefer reason-backed signals, falling back to repo-level
// heuristics when the reason engine has no explicit code for the repo.

import type { MetaCounts, Repo } from "../../types";
import { reasonStore, repoStore } from "../storage/singleton";
import type { ReasonCode } from "../types";

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function hasReasonCode(repoId: string, code: ReasonCode): boolean {
  const reason = reasonStore.get(repoId);
  if (!reason) return false;
  return reason.codes.includes(code);
}

function placesGainedFromReason(repoId: string): number | null {
  const reason = reasonStore.get(repoId);
  if (!reason) return null;
  for (const d of reason.details) {
    if (d.code !== "rank_jump") continue;
    for (const ev of d.evidence) {
      if (ev.label === "Places gained" && typeof ev.value === "number") {
        return ev.value;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Single-pass rollup of the 7 meta counts used by the terminal's meta bar.
 * Reason-backed counts fall back to repo-level heuristics when the reason
 * engine has no explicit code for any repo.
 */
export function getMetaCounts(): MetaCounts {
  const now = Date.now();
  const all = repoStore.getAll();

  let hot = 0;
  let breakouts = 0;
  let quietKillers = 0;
  let newCount = 0;
  let discussed = 0;

  // Reason-backed counters.
  let rankClimbersByReason = 0;
  let freshReleasesByReason = 0;

  // Fallback counters (used when the reason-backed count is zero).
  let rankClimbersFallback = 0;
  let freshReleasesFallback = 0;

  for (const r of all) {
    if (r.movementStatus === "hot") hot += 1;
    if (r.movementStatus === "breakout") breakouts += 1;
    if (r.movementStatus === "quiet_killer") quietKillers += 1;

    const created = Date.parse(r.createdAt);
    if (Number.isFinite(created) && now - created < 30 * MS_PER_DAY) {
      newCount += 1;
    }

    if (r.mentionCount24h > 0) discussed += 1;

    const reason = reasonStore.get(r.id);
    if (reason?.codes.includes("rank_jump")) rankClimbersByReason += 1;

    const hasRecentReleaseReason =
      reason?.codes.includes("release_recent") ||
      reason?.codes.includes("release_major");
    if (hasRecentReleaseReason) {
      // Only count when the release is within the 48h freshness window.
      if (r.lastReleaseAt) {
        const t = Date.parse(r.lastReleaseAt);
        if (Number.isFinite(t) && now - t < 48 * MS_PER_HOUR) {
          freshReleasesByReason += 1;
        } else {
          // Reason exists but release timestamp outside window — don't count
          // under the "fresh" meta, but still allow fallback path below to
          // pick it up if it's within 7d.
        }
      }
    }

    // Fallback candidates — only used when the reason-backed path is empty.
    if (r.rank > 0 && r.rank <= 20) rankClimbersFallback += 1;
    if (r.lastReleaseAt) {
      const t = Date.parse(r.lastReleaseAt);
      if (Number.isFinite(t) && now - t < 7 * MS_PER_DAY) {
        freshReleasesFallback += 1;
      }
    }
  }

  const rankClimbers =
    rankClimbersByReason > 0 ? rankClimbersByReason : rankClimbersFallback;
  const freshReleases =
    freshReleasesByReason > 0 ? freshReleasesByReason : freshReleasesFallback;

  return {
    hot,
    breakouts,
    quietKillers,
    new: newCount,
    discussed,
    rankClimbers,
    freshReleases,
  };
}

/**
 * Rank climbers — repos with a rank_jump reason code, mapped to
 * { repo, rankDelta }. Falls back to top-N by rank asc when no reasons
 * carry the rank_jump signal.
 */
export function getRankClimbers(
  limit: number = 10,
): Array<{ repo: Repo; rankDelta: number }> {
  const lim = Math.max(0, limit);
  const all = repoStore.getAll();

  // Reason-backed path.
  const byReason: Array<{ repo: Repo; rankDelta: number }> = [];
  for (const r of all) {
    if (!hasReasonCode(r.id, "rank_jump")) continue;
    const delta = placesGainedFromReason(r.id) ?? 0;
    byReason.push({ repo: r, rankDelta: delta });
  }
  byReason.sort((a, b) => b.rankDelta - a.rankDelta);

  if (byReason.length > 0) {
    return byReason.slice(0, lim);
  }

  // Fallback: top-N by rank asc, rankDelta=0 since we have no history.
  const sorted = all
    .filter((r) => r.rank > 0)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, lim)
    .map((r) => ({ repo: r, rankDelta: 0 }));
  return sorted;
}

/**
 * Fresh releases within `hoursBack`. Prefers repos with a release reason
 * code; falls back to any repo whose `lastReleaseAt` is within the window.
 * Always returns up to `limit` repos sorted newest-release-first.
 */
export function getFreshReleases(hoursBack: number, limit: number): Repo[] {
  const now = Date.now();
  const hours = Math.max(0, hoursBack);
  const lim = Math.max(0, limit);
  const cutoff = now - hours * MS_PER_HOUR;
  const all = repoStore.getAll();

  // Reason-backed first.
  const reasoned: Repo[] = [];
  for (const r of all) {
    if (!r.lastReleaseAt) continue;
    const t = Date.parse(r.lastReleaseAt);
    if (!Number.isFinite(t) || t < cutoff) continue;
    const reason = reasonStore.get(r.id);
    if (!reason) continue;
    if (
      reason.codes.includes("release_recent") ||
      reason.codes.includes("release_major")
    ) {
      reasoned.push(r);
    }
  }

  if (reasoned.length > 0) {
    reasoned.sort((a, b) => {
      const ta = Date.parse(a.lastReleaseAt as string);
      const tb = Date.parse(b.lastReleaseAt as string);
      return tb - ta;
    });
    return reasoned.slice(0, lim);
  }

  // Fallback: any repo in the window.
  const fallback = all
    .filter((r) => {
      if (!r.lastReleaseAt) return false;
      const t = Date.parse(r.lastReleaseAt);
      return Number.isFinite(t) && t >= cutoff;
    })
    .sort((a, b) => {
      const ta = Date.parse(a.lastReleaseAt as string);
      const tb = Date.parse(b.lastReleaseAt as string);
      return tb - ta;
    });
  return fallback.slice(0, lim);
}
