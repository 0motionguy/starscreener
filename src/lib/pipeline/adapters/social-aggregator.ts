// StarScreener — Social signal aggregator.
//
// Rolls a raw list of RepoMention up into a single SocialAggregate record
// that feeds both the scorer (socialBuzz component) and the repo detail UI.
//
// All math here is intentionally simple so the result is easy to reason about
// and explain in the UI. Weighted sentiment and the buzz formula are the only
// non-trivial parts; both are kept pure and side-effect-free.

import { clamp } from "@/lib/utils";
import type { SocialPlatform, Sentiment } from "@/lib/types";
import type { RepoMention, SocialAggregate } from "../types";

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Aggregate a flat list of mentions into a SocialAggregate for a single repo.
 * `now` is injectable for deterministic tests; defaults to Date.now().
 */
export function aggregateMentions(
  repoId: string,
  mentions: RepoMention[],
  now: number = Date.now(),
): SocialAggregate {
  const computedAt = new Date(now).toISOString();

  // Pre-compute posted timestamps once — guards against repeated Date parsing.
  const withTs = mentions.map((m) => ({
    m,
    ts: safeParse(m.postedAt),
  }));

  const last24h = withTs.filter(
    (x) => x.ts !== null && now - x.ts <= MS_PER_DAY,
  );
  const last7d = withTs.filter(
    (x) => x.ts !== null && now - x.ts <= 7 * MS_PER_DAY,
  );

  const mentionCount24h = last24h.length;
  const mentionCount7d = last7d.length;

  // Platform breakdown across the 7-day window — matches what the UI shows.
  const platformBreakdown: Partial<Record<SocialPlatform, number>> = {};
  for (const { m } of last7d) {
    platformBreakdown[m.platform] = (platformBreakdown[m.platform] ?? 0) + 1;
  }

  // Engagement-weighted sentiment: positive/neutral/negative → +1/0/-1.
  // When total engagement is zero we fall back to a plain mean so we don't
  // divide by zero and don't lose sentiment signal for low-engagement posts.
  let weightedSum = 0;
  let weightTotal = 0;
  let unweightedSum = 0;
  let unweightedCount = 0;
  for (const { m } of last7d) {
    const s = sentimentValue(m.sentiment);
    const w = Math.max(0, m.engagement);
    weightedSum += s * w;
    weightTotal += w;
    unweightedSum += s;
    unweightedCount += 1;
  }
  let sentimentScore = 0;
  if (weightTotal > 0) {
    sentimentScore = weightedSum / weightTotal;
  } else if (unweightedCount > 0) {
    sentimentScore = unweightedSum / unweightedCount;
  }
  sentimentScore = clamp(sentimentScore, -1, 1);

  // Influencer + reach tallies across the 7-day window.
  let influencerMentions = 0;
  let totalReach = 0;
  for (const { m } of last7d) {
    if (m.isInfluencer) influencerMentions += 1;
    totalReach += Math.max(0, m.reach);
  }

  // Buzz score — scaled from the 24h window with bonuses.
  // log-normalized: ln(1+n)/ln(1+50) * 50  → n=50 saturates the base at 50.
  const logBase = Math.log(1 + 50);
  const logComponent = (Math.log(1 + mentionCount24h) / logBase) * 50;
  let buzz = Math.min(50, logComponent);

  let influencer24h = 0;
  let hn24h = 0;
  for (const { m, ts } of last24h) {
    if (ts === null) continue;
    if (m.isInfluencer) influencer24h += 1;
    if (m.platform === "hackernews") hn24h += 1;
  }
  if (influencer24h > 0) buzz += 20;
  if (hn24h > 0) buzz += 10;
  const buzzScore = Math.round(clamp(buzz, 0, 100));

  // Trend — today vs the 6 days before today.
  const priorWindowStart = now - 7 * MS_PER_DAY;
  const priorWindowEnd = now - MS_PER_DAY;
  let priorCount = 0;
  for (const { ts } of withTs) {
    if (ts === null) continue;
    if (ts >= priorWindowStart && ts < priorWindowEnd) priorCount += 1;
  }
  const priorDailyAvg = priorCount / 6;
  const buzzTrend = computeTrend(mentionCount24h, priorDailyAvg);

  return {
    repoId,
    computedAt,
    mentionCount24h,
    mentionCount7d,
    platformBreakdown,
    sentimentScore,
    influencerMentions,
    totalReach,
    buzzScore,
    buzzTrend,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sentimentValue(s: Sentiment): number {
  if (s === "positive") return 1;
  if (s === "negative") return -1;
  return 0;
}

/** Parse ISO date safely. Returns null on invalid input. */
function safeParse(iso: string): number | null {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

function computeTrend(
  current: number,
  priorDailyAvg: number,
): SocialAggregate["buzzTrend"] {
  // Nothing happening today AND nothing happened before → quiet.
  if (current === 0 && priorDailyAvg === 0) return "quiet";

  // Prior history is empty but we do have today — treat as rising/spiking
  // relative to zero.
  if (priorDailyAvg === 0) {
    if (current >= 3) return "spiking";
    if (current >= 1) return "rising";
    return "quiet";
  }

  const ratio = current / priorDailyAvg;
  if (ratio > 3) return "spiking";
  if (ratio >= 1.5) return "rising";
  if (ratio >= 0.5) return "steady";
  // Ratio < 0.5 with prior activity.
  if (current === 0 || ratio < 0.1) return "fading";
  return "fading";
}
