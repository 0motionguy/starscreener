// TOP composite ranker for the trending hub default view (`/`).
//
// Combines five normalized signals into a 0-100 score:
//   starVelocity     × 0.40   weighted blend of 24h/7d/30d star deltas
//   mentionVelocity  × 0.30   weighted blend of 24h/7d cross-source mentions
//   freshnessScore   × 0.10   1/(days since last commit + 1)
//   sourceDiversity  × 0.10   unique mention sources firing (out of 6)
//   breakoutBonus    × 0.10   binary boost when 24h delta > 3× cohort median AND ≥3 sources
//
// All normalizable terms are scaled against the visible cohort's non-zero
// median, then clamped to [0, 1]. This makes the ranking robust across
// language slices (a slow-week JS cohort and a hot-week Rust cohort both
// emit useful top-10s without re-tuning weights).

import type { Repo, SocialPlatform } from "@/lib/types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const WEIGHT_STAR_VELOCITY = 0.40;
const WEIGHT_MENTION_VELOCITY = 0.30;
const WEIGHT_FRESHNESS = 0.10;
const WEIGHT_SOURCE_DIVERSITY = 0.10;
const WEIGHT_BREAKOUT = 0.10;

const MENTION_SOURCE_TARGET = 6; // HN + Bluesky + Lobsters + Reddit + X + DevTo
const BREAKOUT_DELTA_MULTIPLIER = 3;
const BREAKOUT_MIN_SOURCES = 3;

function starVelocityRaw(repo: Repo): number {
  const d24 = repo.starsDelta24h ?? 0;
  const d7 = repo.starsDelta7d ?? 0;
  const d30 = repo.starsDelta30d ?? 0;
  // Heavier weight on recent activity — 24h * 0.5 + 7d * 0.3 + 30d * 0.2.
  return d24 * 0.5 + d7 * 0.3 + d30 * 0.2;
}

function mentionVelocityRaw(repo: Repo): number {
  const m24 = repo.mentions?.total24h ?? 0;
  const m7 = repo.mentions?.total7d ?? 0;
  // 7d count divided by 7 to compare apples-to-apples with the 24h count
  // (both expressed as mentions-per-day).
  return m24 * 0.6 + (m7 / 7) * 0.4;
}

function uniqueMentionSources(repo: Repo): number {
  const per = repo.mentions?.perSource;
  if (!per) return 0;
  let count = 0;
  for (const key of Object.keys(per) as SocialPlatform[]) {
    if ((per[key]?.count24h ?? 0) > 0) count++;
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

function nonZeroMedian(values: number[]): number {
  const positive = values.filter((v) => v > 0);
  if (positive.length === 0) return 0;
  const sorted = positive.sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

interface CompositeBreakdown {
  starVelocity: number;
  mentionVelocity: number;
  freshness: number;
  diversity: number;
  breakout: number;
  topScore: number;
}

export function computeTopComposite(repos: Repo[]): Map<string, number> {
  const breakdowns = computeTopCompositeBreakdown(repos);
  const scores = new Map<string, number>();
  for (const [id, b] of breakdowns) scores.set(id, b.topScore);
  return scores;
}

export function computeTopCompositeBreakdown(
  repos: Repo[],
): Map<string, CompositeBreakdown> {
  const nowMs = Date.now();

  const items = repos.map((repo) => ({
    id: repo.id,
    starsRaw: starVelocityRaw(repo),
    mentionsRaw: mentionVelocityRaw(repo),
    fresh: freshnessScore(repo, nowMs),
    sources: uniqueMentionSources(repo),
    delta24h: repo.starsDelta24h ?? 0,
  }));

  // Use NON-ZERO median to avoid /0 + to avoid sparse cohorts inflating zero-mention rows.
  const starMedian = nonZeroMedian(items.map((i) => i.starsRaw)) || 1;
  const mentionMedian = nonZeroMedian(items.map((i) => i.mentionsRaw)) || 1;
  const d24Median = nonZeroMedian(items.map((i) => i.delta24h)) || 1;

  const out = new Map<string, CompositeBreakdown>();
  for (const item of items) {
    const starVelocity = clamp01(item.starsRaw / starMedian);
    const mentionVelocity = clamp01(item.mentionsRaw / mentionMedian);
    const fresh = clamp01(item.fresh);
    const diversity = clamp01(item.sources / MENTION_SOURCE_TARGET);
    const isBreakout =
      item.delta24h > d24Median * BREAKOUT_DELTA_MULTIPLIER &&
      item.sources >= BREAKOUT_MIN_SOURCES;
    const breakout = isBreakout ? 1 : 0;

    const topScore =
      clamp01(
        starVelocity * WEIGHT_STAR_VELOCITY +
          mentionVelocity * WEIGHT_MENTION_VELOCITY +
          fresh * WEIGHT_FRESHNESS +
          diversity * WEIGHT_SOURCE_DIVERSITY +
          breakout * WEIGHT_BREAKOUT,
      ) * 100;

    out.set(item.id, {
      starVelocity,
      mentionVelocity,
      freshness: fresh,
      diversity,
      breakout,
      topScore,
    });
  }

  return out;
}
