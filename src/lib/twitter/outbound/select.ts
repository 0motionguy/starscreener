// Daily-breakouts selection — which repos make the outbound thread.
//
// Lives outside the cron route because Next 15 forbids non-handler
// exports from route.ts, and the selection math deserves direct unit
// tests (the "3 random-looking repos" failure mode came from an
// untested picker buried in the route).
//
// Selection is tiered so the thread degrades gracefully when signal
// data is partially stale instead of collapsing to array order:
//   Tier A — multi-signal breakouts (channelsFiring >= 2), the real
//            "firing across multiple signals" cohort.
//   Tier B — single-signal movers the scoring pipeline already flags
//            (movementStatus breakout/hot/rising).
//   Tier C — raw 24h star velocity, the always-available fallback.
// Every tier has a deterministic multi-key sort so equal primary
// scores never fall through to insertion order.
//
// A quality floor applies to all tiers: a repo with no positive
// movement never makes the thread. Fewer-than-count real repos beats
// count padded with dead ones.

import type { Repo } from "@/lib/types";

import type { OutboundRunRecord } from "./types";

/** Repos per daily thread. 1 intro + 10 items + 1 idea = 12 posts/day. */
export const DAILY_BREAKOUT_COUNT = 10;

/** Days a featured repo sits out before it can headline again. */
export const FEATURED_COOLDOWN_DAYS = 7;

/**
 * Count repos that actually broke out THIS WEEK — a positive 7-day star
 * delta AND multi-signal (>=2 channels firing). Used for the weekly
 * recap intro line. This is deliberately NOT "every repo that has ever
 * lit 2 channels": without the 7d-movement gate the count is a stable,
 * corpus-sized number that never reflects the week (the bug this
 * replaces rendered ~191 "breakouts" into every Friday tweet).
 */
export function countWeeklyBreakouts(repos: Repo[]): number {
  return repos.filter(
    (r) => (r.starsDelta7d ?? 0) > 0 && (r.channelsFiring ?? 0) >= 2,
  ).length;
}

export interface PickDailyBreakoutsOptions {
  /** How many repos to return. Defaults to DAILY_BREAKOUT_COUNT. */
  count?: number;
  /** Lowercased fullNames to skip (e.g. featured in the last 7 days). */
  exclude?: ReadonlySet<string>;
  /**
   * Which star-delta window drives the floor, Tier C, and tie-breaks.
   * "24h" (default) for the daily thread; "7d" for the weekly recap.
   */
  window?: "24h" | "7d";
}

export interface RecentlyFeaturedOptions {
  /** Cooldown window in days. Defaults to FEATURED_COOLDOWN_DAYS. */
  days?: number;
  /** Clock override for tests. */
  now?: Date;
  /** Restrict to these run kinds; omit to count every run. */
  kinds?: ReadonlyArray<OutboundRunRecord["kind"]>;
}

/**
 * Repos featured in recent runs, as a lowercased fullName set. Runs
 * older than `days` (or without a featuredRepos list — pre-upgrade
 * audit rows) are ignored. Pass `kinds` to scope the cooldown to
 * specific run kinds — the daily thread only excludes repos its OWN
 * past runs featured, so a Friday-recap appearance doesn't knock a
 * repo out of the next week of dailies.
 */
export function recentlyFeaturedRepos(
  runs: OutboundRunRecord[],
  options: RecentlyFeaturedOptions = {},
): Set<string> {
  const days = options.days ?? FEATURED_COOLDOWN_DAYS;
  const now = options.now ?? new Date();
  const kinds = options.kinds;
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  const featured = new Set<string>();
  for (const run of runs) {
    if (kinds && !kinds.includes(run.kind)) continue;
    const startedAt = Date.parse(run.startedAt);
    if (!Number.isFinite(startedAt) || startedAt < cutoff) continue;
    for (const fullName of run.featuredRepos ?? []) {
      featured.add(fullName.toLowerCase());
    }
  }
  return featured;
}

type DeltaWindow = NonNullable<PickDailyBreakoutsOptions["window"]>;

function windowDelta(repo: Repo, window: DeltaWindow): number {
  return (window === "7d" ? repo.starsDelta7d : repo.starsDelta24h) ?? 0;
}

function windowDeltaMissing(repo: Repo, window: DeltaWindow): boolean {
  // Only the 24h delta carries a backfill marker today; the 7d delta
  // comes straight from the deltas snapshot ring.
  return window === "24h" && repo.starsDelta24hMissing === true;
}

/**
 * Quality floor: only repos with some positive movement qualify.
 * Multi-signal repos pass even with a flat star delta — the other
 * channels are the movement.
 */
function hasPositiveMovement(repo: Repo): boolean {
  if ((repo.channelsFiring ?? 0) >= 2) return true;
  if ((repo.starsDelta24h ?? 0) > 0) return true;
  if ((repo.starsDelta7d ?? 0) > 0) return true;
  return false;
}

function byCrossSignal(window: DeltaWindow) {
  return (a: Repo, b: Repo): number => {
    const css = (b.crossSignalScore ?? 0) - (a.crossSignalScore ?? 0);
    if (css !== 0) return css;
    return byMomentum(window)(a, b);
  };
}

function byMomentum(window: DeltaWindow) {
  return (a: Repo, b: Repo): number => {
    const momentum = (b.momentumScore ?? 0) - (a.momentumScore ?? 0);
    if (momentum !== 0) return momentum;
    return byStarDelta(window)(a, b);
  };
}

function byStarDelta(window: DeltaWindow) {
  return (a: Repo, b: Repo): number => {
    const delta = windowDelta(b, window) - windowDelta(a, window);
    if (delta !== 0) return delta;
    // Final stable tiebreak so runs are reproducible for identical data.
    return a.fullName.localeCompare(b.fullName);
  };
}

const TIER_B_STATUSES: ReadonlySet<Repo["movementStatus"]> = new Set([
  "breakout",
  "hot",
  "rising",
]);

/**
 * Pick the repos for today's thread. Returns up to `count` repos —
 * fewer when the data doesn't support more, never padded.
 */
export function pickDailyBreakouts(
  repos: Repo[],
  options: PickDailyBreakoutsOptions = {},
): Repo[] {
  const count = options.count ?? DAILY_BREAKOUT_COUNT;
  const exclude = options.exclude ?? new Set<string>();
  const window = options.window ?? "24h";

  const seen = new Set<string>();
  const candidates: Repo[] = [];
  for (const repo of repos) {
    if (!repo.fullName) continue;
    const key = repo.fullName.toLowerCase();
    if (seen.has(key) || exclude.has(key)) continue;
    if (!hasPositiveMovement(repo)) continue;
    seen.add(key);
    candidates.push(repo);
  }

  const tierA = candidates
    .filter((r) => (r.channelsFiring ?? 0) >= 2)
    .sort(byCrossSignal(window));
  const tierB = candidates
    .filter(
      (r) =>
        (r.channelsFiring ?? 0) < 2 && TIER_B_STATUSES.has(r.movementStatus),
    )
    .sort(byMomentum(window));
  const tierC = candidates
    .filter(
      (r) =>
        (r.channelsFiring ?? 0) < 2 &&
        !TIER_B_STATUSES.has(r.movementStatus) &&
        !windowDeltaMissing(r, window) &&
        windowDelta(r, window) > 0,
    )
    .sort(byStarDelta(window));

  return [...tierA, ...tierB, ...tierC].slice(0, count);
}
