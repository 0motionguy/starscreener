// Discovery ranker — surfaces "the next gem" before it's on every board.
//
// The TOP composite (./top-composite.ts) is tuned for momentum at scale:
// star velocity (55%), mention velocity (20%), freshness (10%), source
// diversity (5%), breakout-bonus (10%, ≥3× cohort-median delta + ≥3
// sources). That ranks established repos with daily spikes excellently
// and emerging gems poorly — a 50-star repo gaining 25/day has 50% daily
// velocity but is invisible because (a) it fails OSS-Insight's 50-star
// floor upstream, (b) its raw delta is below cohort median, (c) it
// usually has 1-2 sources, not 3.
//
// Discovery scores the OPPOSITE signal: small base, fast acceleration,
// multi-source first-mention. Eligibility hard-floors at 5 ≤ stars <
// 1500 (kills bot trash and lets the small-base cohort form), alive
// within 90 days (no abandoned repos), and at least one of: velocity
// rate ≥ 10% daily, OR ≥ 2 unique mention sources in the last 24h.
// Score blends:
//   velocity-rate     × 0.50   delta24h / max(stars, 1), normalized
//                              against the ELIGIBLE-COHORT median (not
//                              the visible cohort — eligible repos
//                              would be drowned by established medians)
//   mention-diversity × 0.30   unique source count in 24h, ÷ 3 (3+ = full)
//   freshness         × 0.10   1 / (days since commit + 1)
//   multi-source flag + 0.20   binary, fires when sources ≥ 2 (the
//                              "first-mention across N feeds" signal —
//                              the strongest forward indicator we have)
//
// Final value is 0-100. Score 0 = ineligible (filtered for both ranking
// AND the FeaturedRepos discovery pin). A score map approach mirrors
// computeTopComposite for consistent call-site shape.

import type { Repo, SocialPlatform } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

const MIN_STARS = 5;
const MAX_STARS = 1500;
const MAX_DAYS_SINCE_COMMIT = 90;
const VELOCITY_RATE_MIN = 0.10;
const FRESH_MENTION_SOURCES_MIN = 2;

const WEIGHT_VELOCITY = 0.50;
const WEIGHT_DIVERSITY = 0.30;
const WEIGHT_FRESHNESS = 0.10;
const WEIGHT_MULTI_SOURCE_BONUS = 0.20;

const FULL_DIVERSITY_AT = 3;
const DEFAULT_VELOCITY_FLOOR = 0.10;

function uniqueMentionSources24h(repo: Repo): number {
  const per = repo.mentions?.perSource;
  if (!per) return 0;
  let count = 0;
  for (const key of Object.keys(per) as SocialPlatform[]) {
    if ((per[key]?.count24h ?? 0) > 0) count += 1;
  }
  return count;
}

function freshnessScore(repo: Repo, nowMs: number): number {
  if (!repo.lastCommitAt) return 0;
  const ms = Date.parse(repo.lastCommitAt);
  if (!Number.isFinite(ms)) return 0;
  const days = Math.max(0, (nowMs - ms) / DAY_MS);
  return 1 / (days + 1);
}

function isAlive(repo: Repo, nowMs: number): boolean {
  if (!repo.lastCommitAt) return false;
  const ms = Date.parse(repo.lastCommitAt);
  if (!Number.isFinite(ms)) return false;
  return (nowMs - ms) / DAY_MS <= MAX_DAYS_SINCE_COMMIT;
}

function velocityRate(repo: Repo): number {
  const stars = repo.stars ?? 0;
  const delta = repo.starsDelta24h ?? 0;
  return delta / Math.max(stars, 1);
}

function isEligible(repo: Repo, nowMs: number): boolean {
  const stars = repo.stars ?? 0;
  if (stars < MIN_STARS || stars >= MAX_STARS) return false;
  if (!isAlive(repo, nowMs)) return false;
  const rate = velocityRate(repo);
  const sources = uniqueMentionSources24h(repo);
  return rate >= VELOCITY_RATE_MIN || sources >= FRESH_MENTION_SOURCES_MIN;
}

function nonZeroMedian(values: number[]): number {
  const positive = values.filter((v) => v > 0);
  if (positive.length === 0) return 0;
  const sorted = positive.sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export interface DiscoveryBreakdown {
  eligible: boolean;
  velocity: number;
  diversity: number;
  freshness: number;
  multiSourceBonus: number;
  discoveryScore: number;
}

export function computeDiscoveryScore(repos: Repo[]): Map<string, number> {
  const breakdowns = computeDiscoveryBreakdown(repos);
  const scores = new Map<string, number>();
  for (const [id, b] of breakdowns) scores.set(id, b.discoveryScore);
  return scores;
}

export function computeDiscoveryBreakdown(
  repos: Repo[],
): Map<string, DiscoveryBreakdown> {
  const nowMs = Date.now();

  const items = repos.map((repo) => ({
    id: repo.id,
    eligible: isEligible(repo, nowMs),
    rate: velocityRate(repo),
    sources: uniqueMentionSources24h(repo),
    fresh: freshnessScore(repo, nowMs),
  }));

  // Median over eligible only — discovery loses meaning if normalized
  // against the established cohort that dominates the visible set.
  const eligibleRates = items.filter((i) => i.eligible).map((i) => i.rate);
  const velocityMedian = nonZeroMedian(eligibleRates) || DEFAULT_VELOCITY_FLOOR;

  const out = new Map<string, DiscoveryBreakdown>();
  for (const item of items) {
    if (!item.eligible) {
      out.set(item.id, {
        eligible: false,
        velocity: 0,
        diversity: 0,
        freshness: 0,
        multiSourceBonus: 0,
        discoveryScore: 0,
      });
      continue;
    }

    const velocity = clamp01(item.rate / velocityMedian);
    const diversity = clamp01(item.sources / FULL_DIVERSITY_AT);
    const fresh = clamp01(item.fresh);
    const multiSourceBonus =
      item.sources >= FRESH_MENTION_SOURCES_MIN ? WEIGHT_MULTI_SOURCE_BONUS : 0;

    const score =
      clamp01(
        velocity * WEIGHT_VELOCITY +
          diversity * WEIGHT_DIVERSITY +
          fresh * WEIGHT_FRESHNESS +
          multiSourceBonus,
      ) * 100;

    out.set(item.id, {
      eligible: true,
      velocity,
      diversity,
      freshness: fresh,
      multiSourceBonus,
      discoveryScore: score,
    });
  }

  return out;
}

/**
 * Pick the highest-scoring discovery candidate from a list, or undefined when
 * the eligible cohort is empty or all scores are zero. Used by the FeaturedRepos
 * hero to slot the DISCOVERY card alongside TOP / BREAKOUT / TREND.
 */
export function pickTopDiscoveryRepo(repos: Repo[]): Repo | undefined {
  const scores = computeDiscoveryScore(repos);
  let bestId: string | undefined;
  let bestScore = 0;
  for (const [id, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }
  if (!bestId) return undefined;
  return repos.find((r) => r.id === bestId);
}
