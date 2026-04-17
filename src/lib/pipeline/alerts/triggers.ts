// StarScreener Pipeline — pure trigger evaluators for alert rules.
//
// Each function takes an AlertRule and a TriggerContext and returns a
// TriggerResult describing whether the rule fired, the evaluated value,
// and a human-readable title/body for the AlertEvent.
//
// All functions here are pure — no storage, no I/O, no Date.now side
// effects except for the daily/weekly digest evaluators which read
// rule.lastFiredAt to enforce scheduling cadence.

import type { Repo } from "../../types";
import type {
  AlertRule,
  AlertTriggerType,
  RepoScore,
} from "../types";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface TriggerContext {
  repo: Repo;
  score?: RepoScore;
  previousRepo?: Repo;
  previousScore?: RepoScore;
  previousRank?: number;
  isBreakout?: boolean;
}

export interface TriggerResult {
  fired: boolean;
  value: number;
  title: string;
  body: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOT_FIRED: TriggerResult = {
  fired: false,
  value: 0,
  title: "",
  body: "",
};

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1000) {
    return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  return String(Math.round(n));
}

function hoursBetween(aIso: string, bIso: string): number {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.abs(b - a) / (1000 * 60 * 60);
}

function msSinceIso(iso: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Date.now() - t;
}

// ---------------------------------------------------------------------------
// Trigger evaluators
// ---------------------------------------------------------------------------

export function evaluateStarSpike(
  rule: AlertRule,
  ctx: TriggerContext,
): TriggerResult {
  const delta = ctx.repo.starsDelta24h ?? 0;
  if (delta <= rule.threshold) return NOT_FIRED;
  const stars = formatNumber(delta);
  return {
    fired: true,
    value: delta,
    title: `${ctx.repo.fullName} spiked +${stars} stars in 24h`,
    body: `Gained ${stars} stars in the last 24 hours (threshold ${formatNumber(rule.threshold)}). Now at ${formatNumber(ctx.repo.stars)} total stars.`,
  };
}

export function evaluateNewRelease(
  rule: AlertRule,
  ctx: TriggerContext,
): TriggerResult {
  const currentTag = ctx.repo.lastReleaseTag;
  const previousTag = ctx.previousRepo?.lastReleaseTag ?? null;
  const releasedAt = ctx.repo.lastReleaseAt;

  if (!currentTag || !releasedAt) return NOT_FIRED;
  if (previousTag === currentTag) return NOT_FIRED;

  // Only fire if the release is recent (within 48h)
  const hoursAgo = msSinceIso(releasedAt) / (1000 * 60 * 60);
  if (!Number.isFinite(hoursAgo) || hoursAgo > 48) return NOT_FIRED;

  return {
    fired: true,
    value: 1,
    title: `${ctx.repo.fullName} released ${currentTag}`,
    body: `New release ${currentTag} shipped ${Math.round(hoursAgo)}h ago.${previousTag ? ` Previous tag was ${previousTag}.` : ""}`,
  };
}

export function evaluateRankJump(
  rule: AlertRule,
  ctx: TriggerContext,
): TriggerResult {
  if (ctx.previousRank === undefined) return NOT_FIRED;
  const jump = ctx.previousRank - ctx.repo.rank;
  if (jump < rule.threshold) return NOT_FIRED;
  return {
    fired: true,
    value: jump,
    title: `${ctx.repo.fullName} climbed ${jump} places to #${ctx.repo.rank}`,
    body: `Moved from rank #${ctx.previousRank} to #${ctx.repo.rank} (+${jump} places). Threshold was ${rule.threshold}.`,
  };
}

export function evaluateDiscussionSpike(
  rule: AlertRule,
  ctx: TriggerContext,
): TriggerResult {
  const mentions = ctx.repo.mentionCount24h ?? 0;
  if (mentions <= rule.threshold) return NOT_FIRED;
  return {
    fired: true,
    value: mentions,
    title: `${ctx.repo.fullName} has ${formatNumber(mentions)} mentions today`,
    body: `${formatNumber(mentions)} social mentions in the last 24h (threshold ${formatNumber(rule.threshold)}).`,
  };
}

export function evaluateMomentumThreshold(
  rule: AlertRule,
  ctx: TriggerContext,
): TriggerResult {
  const current = ctx.score?.overall;
  const previous = ctx.previousScore?.overall;
  if (current === undefined || previous === undefined) return NOT_FIRED;

  const crossedUp = previous < rule.threshold && current >= rule.threshold;
  const crossedDown = previous >= rule.threshold && current < rule.threshold;
  if (!crossedUp && !crossedDown) return NOT_FIRED;

  const direction = crossedUp ? "crossed above" : "dropped below";
  const arrow = crossedUp ? "↑" : "↓";

  return {
    fired: true,
    value: current,
    title: `${ctx.repo.fullName} momentum ${direction} ${rule.threshold} (${Math.round(current)} ${arrow})`,
    body: `Momentum moved from ${Math.round(previous)} to ${Math.round(current)}, ${direction} the ${rule.threshold} threshold.`,
  };
}

export function evaluateBreakoutDetected(
  rule: AlertRule,
  ctx: TriggerContext,
): TriggerResult {
  void rule;
  if (ctx.isBreakout !== true) return NOT_FIRED;
  // Only fire on the transition into breakout state
  const wasBreakout = ctx.previousScore ? ctx.previousScore.isBreakout : false;
  if (wasBreakout) return NOT_FIRED;
  return {
    fired: true,
    value: ctx.score?.overall ?? 0,
    title: `${ctx.repo.fullName} is breaking out`,
    body: `Breakout classifier fired. Stars: ${formatNumber(ctx.repo.stars)}, momentum: ${Math.round(ctx.score?.overall ?? 0)}, 24h delta: +${formatNumber(ctx.repo.starsDelta24h)}.`,
  };
}

export function evaluateDailyDigest(
  rule: AlertRule,
  ctx: TriggerContext,
): TriggerResult {
  void ctx;
  const now = Date.now();
  const lastFired = rule.lastFiredAt ? Date.parse(rule.lastFiredAt) : 0;
  const DAY_MS = 24 * 60 * 60 * 1000;
  if (Number.isFinite(lastFired) && now - lastFired < DAY_MS) return NOT_FIRED;
  return {
    fired: true,
    value: 0,
    title: "Daily digest ready",
    body: "Your daily StarScreener digest is ready.",
  };
}

export function evaluateWeeklyDigest(
  rule: AlertRule,
  ctx: TriggerContext,
): TriggerResult {
  void ctx;
  const now = Date.now();
  const lastFired = rule.lastFiredAt ? Date.parse(rule.lastFiredAt) : 0;
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  if (Number.isFinite(lastFired) && now - lastFired < WEEK_MS) return NOT_FIRED;
  return {
    fired: true,
    value: 0,
    title: "Weekly digest ready",
    body: "Your weekly StarScreener digest is ready.",
  };
}

// ---------------------------------------------------------------------------
// Dispatch table
// ---------------------------------------------------------------------------

export const TRIGGER_EVALUATORS: Record<
  AlertTriggerType,
  (rule: AlertRule, ctx: TriggerContext) => TriggerResult
> = {
  star_spike: evaluateStarSpike,
  new_release: evaluateNewRelease,
  rank_jump: evaluateRankJump,
  discussion_spike: evaluateDiscussionSpike,
  momentum_threshold: evaluateMomentumThreshold,
  breakout_detected: evaluateBreakoutDetected,
  daily_digest: evaluateDailyDigest,
  weekly_digest: evaluateWeeklyDigest,
};

// Exported helpers for tests / callers.
export { hoursBetween, formatNumber };
