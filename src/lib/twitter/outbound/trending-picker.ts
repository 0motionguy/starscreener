// Pure selection logic for the 3x/day trending autopilot. Given the
// already-ranked repo list (best first) plus the current cooldown + daily-cap
// state, pick the single repo to post next — or null when the cap is hit or
// every top repo is still cooling down. Kept pure so the dedupe/cap math is
// unit-tested without Redis or the box `twitter` CLI; the runner supplies the
// state (cooldown set from Redis TTL keys, today's count from a per-day key).

import type { Repo } from "@/lib/types";
import { isSpamRepo } from "@/lib/ranking/repo-quality";

export interface TrendingPostState {
  /**
   * fullNames posted within the cooldown window. A repo in this set is
   * skipped so re-trending repos don't get spammed every few days. The
   * runner builds it from Redis keys `trending:posted:<fullName>` (TTL 14d).
   */
  cooldownFullNames: Set<string>;
  /** How many trending singles already went out today (UTC). */
  postedTodayCount: number;
}

/**
 * Choose the next repo to tweet. Returns null (a clean no-op) when either:
 *   - the per-day cap is already met, or
 *   - every ranked repo is still within its cooldown window.
 * The cap + cooldown together make a double-fired cron slot idempotent — the
 * spec's "cap + cooldown make double-fires no-ops."
 */
export function selectTrendingPost(
  ranked: Repo[],
  state: TrendingPostState,
  maxPerDay: number,
): Repo | null {
  if (state.postedTodayCount >= maxPerDay) return null;
  for (const repo of ranked) {
    // Defense in depth: never tweet piracy/crack/warez spam even if it slips
    // into the candidate pool from a source that skipped the getDerivedRepos gate.
    if (isSpamRepo(repo)) continue;
    if (!state.cooldownFullNames.has(repo.fullName)) return repo;
  }
  return null;
}
