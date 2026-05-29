// TOP composite ranker for the trending hub default view (`/`).
//
// Combines five normalized signals into a 0-100 score:
//   starVelocity     × 0.55   WINDOW-AWARE star delta blend (see WINDOW_WEIGHTS)
//   mentionVelocity  × 0.20   weighted blend of 24h/7d cross-source mentions
//   freshnessScore   × 0.10   1/(days since last commit + 1)
//   sourceDiversity  × 0.05   unique mention sources firing (out of 6)
//   breakoutBonus    × 0.10   binary boost when 24h delta > 3× cohort median AND ≥3 sources
//
// 2026-05-29 operator fix ("TOP is bad — Qwen #1, it's an LLM not a momentum
// repo"): star-velocity raised 0.40→0.55 and mention-velocity cut 0.30→0.20
// so this STAR-velocity board is dominated by genuine star momentum, not
// social buzz. Previously a heavily-mentioned LLM with a tiny star delta
// (Qwen, +22/24h) outranked repos with real star movement (colby +275,
// BigBox +150) because mentions+freshness+diversity = half the score.
//
// 2026-05-24 operator fix: previously the star-velocity blend was a fixed
// 50/30/20 across 24h/7d/30d regardless of the active window, which let
// items missing the active window's data still rank near the top (warpdotdev,
// openai/codex, QwenLM/qwen-code all surfaced above an item with real 24h
// movement). Now the blend depends on the active window so the table is
// honest about what it's sorting on. Pattern borrowed from the OG
// `trendScoreForTimeRange()` helper in src/lib/filters.ts (deployed prod).
//
// All normalizable terms are scaled against the visible cohort's non-zero
// median, then clamped to [0, 1]. This makes the ranking robust across
// language slices (a slow-week JS cohort and a hot-week Rust cohort both
// emit useful top-10s without re-tuning weights).

import type { Repo, SocialPlatform } from "@/lib/types";
import type { WindowId } from "@/components/trending/TrendingHubHero";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const WEIGHT_STAR_VELOCITY = 0.55;
const WEIGHT_MENTION_VELOCITY = 0.20;
const WEIGHT_FRESHNESS = 0.10;
const WEIGHT_SOURCE_DIVERSITY = 0.05;
const WEIGHT_BREAKOUT = 0.10;

const MENTION_SOURCE_TARGET = 6; // HN + Bluesky + Lobsters + Reddit + X + DevTo
const BREAKOUT_DELTA_MULTIPLIER = 3;
const BREAKOUT_MIN_SOURCES = 3;

// Per-window star-velocity weights. The active window gets ~75%, the other
// two share the rest. An item with NO data in the active window can only
// score up to 0.25 of full star-velocity — which is enough to break ties
// but not enough to outrank an item with real activity in the active window.
const WINDOW_WEIGHTS: Record<WindowId, { d24: number; d7: number; d30: number }> = {
  "1h": { d24: 0.80, d7: 0.15, d30: 0.05 },  // 1h shares 24h's weighting (no separate 1h delta)
  "24h": { d24: 0.80, d7: 0.15, d30: 0.05 },
  "7d": { d24: 0.20, d7: 0.65, d30: 0.15 },
  "30d": { d24: 0.10, d7: 0.25, d30: 0.65 },
};

function starVelocityRaw(repo: Repo, window: WindowId): number {
  // DAILYIZE before weighting. Raw 7d/30d deltas are 7-30× larger than 24h
  // deltas, so a fixed weighted SUM lets stale items dominate. Dividing each
  // window's total by its day count puts every term into "stars per day"
  // units so the window weights actually control influence.
  const d24Daily = repo.starsDelta24h ?? 0;
  const d7Daily = (repo.starsDelta7d ?? 0) / 7;
  const d30Daily = (repo.starsDelta30d ?? 0) / 30;
  const w = WINDOW_WEIGHTS[window];
  return d24Daily * w.d24 + d7Daily * w.d7 + d30Daily * w.d30;
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

export function computeTopComposite(
  repos: Repo[],
  window: WindowId = "24h",
): Map<string, number> {
  const breakdowns = computeTopCompositeBreakdown(repos, window);
  const scores = new Map<string, number>();
  for (const [id, b] of breakdowns) scores.set(id, b.topScore);
  return scores;
}

export function computeTopCompositeBreakdown(
  repos: Repo[],
  window: WindowId = "24h",
): Map<string, CompositeBreakdown> {
  const nowMs = Date.now();

  const items = repos.map((repo) => ({
    id: repo.id,
    starsRaw: starVelocityRaw(repo, window),
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
