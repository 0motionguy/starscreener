// StarScreener Pipeline — mention → SocialAggregate roll-up
//
// Phase 2 (F-DATA-social-persist) reader-side companion to mention-store.ts.
// Reads `.data/mentions.jsonl`, buckets mentions per repo, computes the
// fields we surface as `SocialAggregate`, and writes the result to
// `.data/mention-aggregates.jsonl` so cold-start consumers (homepage SSR,
// scoring engine, query layer) can hydrate a buzz score without re-walking
// the raw mention log.
//
// `socialBuzzScore` (the input to `componentSocialBuzz`) is derived here.
// Today it sat at a hard-coded 0 because nothing fed it. The aggregator
// replaces that shim with a real number, normalized to 0-100, so anti-spam
// dampening + the social component finally have signal to chew on.
//
// Score composition (designed to track the existing "social buzz means
// breakouts" intuition without overshooting on a single viral post):
//
//   buzzScore = clamp(
//       0.50 * volume24h_norm     // count_24h, log-normalized (cap 200)
//     + 0.20 * volume7d_norm      // count_7d, log-normalized (cap 1000)
//     + 0.15 * sources_norm       // distinct platforms ÷ 6 (max in our union)
//     + 0.10 * influencer_norm    // influencer mentions, log-normalized (cap 25)
//     + 0.05 * sentiment_norm     // sentimentScore mapped from [-1,1] → [0,100]
//     , 0, 100)
//
// The 0.50 weight on 24h volume gives short-window spikes the dominant
// voice (matching the "breakout social validation" use case). 7d gives
// quiet-killer growth a path to score. Sources + influencer + sentiment
// are tie-breakers / smoothers.

import type { SocialPlatform } from "@/lib/types";

import type { RepoMention, SocialAggregate } from "../types";
import { clamp } from "@/lib/utils";
import {
  FILES,
  isPersistenceEnabled,
  withFileLock,
  writeJsonlFile,
} from "../storage/file-persistence";
import {
  activeSources,
  groupMentionsByRepo,
  readPersistedMentions,
} from "../storage/mention-store";

// ---------------------------------------------------------------------------
// Time windows
// ---------------------------------------------------------------------------

const HOUR_MS = 60 * 60 * 1000;
const WINDOW_24H_MS = 24 * HOUR_MS;
const WINDOW_7D_MS = 7 * 24 * HOUR_MS;
const WINDOW_30D_MS = 30 * 24 * HOUR_MS;

// ---------------------------------------------------------------------------
// Score normalisation
// ---------------------------------------------------------------------------

/**
 * `log10(1 + x) / log10(1 + cap)` mapped to [0, 100]. Matches the curve used
 * elsewhere in the scoring layer (see `scoring/normalize.ts logNorm`) so a
 * count of `cap` lands at 100 and growth above `cap` saturates gracefully.
 */
function logNorm(value: number, cap: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (cap <= 0) return 0;
  const num = Math.log10(1 + value);
  const den = Math.log10(1 + cap);
  if (den <= 0) return 0;
  return clamp((num / den) * 100, 0, 100);
}

/**
 * Compute the buzzScore (0-100) from the per-window aggregates. Pure — easy
 * to assert from tests without touching the filesystem.
 */
export function computeBuzzScore(input: {
  count24h: number;
  count7d: number;
  sourcesActive: number;
  influencerMentions: number;
  sentimentScore: number;
}): number {
  // Hard zero when there's literally no signal — otherwise the neutral-
  // sentiment baseline (0 → 50/100) leaks ~2.5 buzz points into "no
  // mentions whatsoever", which would skew the bottom of the distribution.
  if (input.count7d === 0 && input.count24h === 0) return 0;

  const volume24h = logNorm(input.count24h, 200);
  const volume7d = logNorm(input.count7d, 1000);
  // Six platforms in the SocialPlatform union today; using six as the
  // saturation point so all-active = 100. If we extend the union we may
  // need to revisit, but 6 is a stable upper bound for now.
  const sources = clamp((input.sourcesActive / 6) * 100, 0, 100);
  const influencer = logNorm(input.influencerMentions, 25);
  // Sentiment ∈ [-1, 1] → [0, 100], clamped just in case an upstream
  // computation drifts outside the contract.
  const sentiment = clamp(((input.sentimentScore + 1) / 2) * 100, 0, 100);

  const weighted =
    0.5 * volume24h +
    0.2 * volume7d +
    0.15 * sources +
    0.1 * influencer +
    0.05 * sentiment;
  return clamp(Math.round(weighted * 10) / 10, 0, 100);
}

// ---------------------------------------------------------------------------
// Trend classification
// ---------------------------------------------------------------------------

/**
 * Classify `buzzTrend` from the (24h, 7d) windowed counts. The thresholds
 * are intentionally coarse — feeding a trend label into the UI doesn't need
 * statistical rigour, just a stable mapping.
 */
export function classifyBuzzTrend(
  count24h: number,
  count7d: number,
): SocialAggregate["buzzTrend"] {
  if (count24h === 0 && count7d === 0) return "quiet";
  // Average daily rate over the rest of the week (days 2-7).
  const restOfWeek = Math.max(0, count7d - count24h);
  const dailyAvg = restOfWeek / 6;
  if (dailyAvg === 0) {
    return count24h > 0 ? "spiking" : "quiet";
  }
  const ratio = count24h / dailyAvg;
  if (ratio >= 3) return "spiking";
  if (ratio >= 1.5) return "rising";
  if (ratio <= 0.3) return "fading";
  return "steady";
}

// ---------------------------------------------------------------------------
// Per-repo aggregation
// ---------------------------------------------------------------------------

/**
 * Build a `SocialAggregate` from the mention list for a single repo. Mentions
 * older than 30 days are still included in totals (totalReach, sentiment),
 * but the windowed counts are strictly time-bounded. `now` is injected so
 * tests can assert windowing without monkey-patching `Date.now`.
 */
export function aggregateRepoMentions(
  repoId: string,
  mentions: RepoMention[],
  now: Date = new Date(),
): SocialAggregate {
  const nowMs = now.getTime();

  let count24h = 0;
  let count7d = 0;
  let count30d = 0;
  let influencer = 0;
  let totalReach = 0;
  let sentimentSum = 0;
  let sentimentN = 0;
  const platformBreakdown: Partial<Record<SocialPlatform, number>> = {};

  for (const m of mentions) {
    const postedMs = Date.parse(m.postedAt);
    if (!Number.isFinite(postedMs)) continue;
    const ageMs = nowMs - postedMs;

    if (ageMs >= 0 && ageMs <= WINDOW_30D_MS) {
      count30d += 1;
      if (ageMs <= WINDOW_7D_MS) {
        count7d += 1;
        if (ageMs <= WINDOW_24H_MS) {
          count24h += 1;
        }
      }
    }

    if (m.isInfluencer) influencer += 1;
    if (Number.isFinite(m.reach)) totalReach += m.reach;
    platformBreakdown[m.platform] =
      (platformBreakdown[m.platform] ?? 0) + 1;

    if (m.sentiment === "positive") {
      sentimentSum += 1;
      sentimentN += 1;
    } else if (m.sentiment === "negative") {
      sentimentSum -= 1;
      sentimentN += 1;
    } else if (m.sentiment === "neutral") {
      sentimentN += 1;
    }
  }

  const sentimentScore =
    sentimentN > 0 ? clamp(sentimentSum / sentimentN, -1, 1) : 0;
  const sourcesActive = activeSources(mentions).length;

  const buzzScore = computeBuzzScore({
    count24h,
    count7d,
    sourcesActive,
    influencerMentions: influencer,
    sentimentScore,
  });

  void count30d; // exposed via component score variants when we wire 30d later

  return {
    repoId,
    computedAt: now.toISOString(),
    mentionCount24h: count24h,
    mentionCount7d: count7d,
    platformBreakdown,
    sentimentScore,
    influencerMentions: influencer,
    totalReach,
    buzzScore,
    buzzTrend: classifyBuzzTrend(count24h, count7d),
  };
}

// ---------------------------------------------------------------------------
// Batch aggregation
// ---------------------------------------------------------------------------

/**
 * Build aggregates for every repo represented in `mentions`. Returns one
 * `SocialAggregate` per distinct `repoId`. Repos with zero mentions are
 * absent from the result — the caller should treat "missing aggregate" as
 * "no signal" rather than synthesising a zero-everything record.
 */
export function buildAggregates(
  mentions: RepoMention[],
  now: Date = new Date(),
): SocialAggregate[] {
  const groups = groupMentionsByRepo(mentions);
  const out: SocialAggregate[] = [];
  for (const [repoId, list] of groups.entries()) {
    out.push(aggregateRepoMentions(repoId, list, now));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Read `.data/mentions.jsonl`, build per-repo aggregates, and overwrite
 * `.data/mention-aggregates.jsonl` with the result. Returns the aggregates
 * actually written so callers can fan them back into the in-memory stores.
 *
 * No-op (returns `[]`) when persistence is disabled. Persistence is per-file
 * locked so a concurrent `mentionStore.persist()` / `appendMentionsToFile`
 * caller can't tear the on-disk view.
 */
export async function aggregateAndPersist(
  now: Date = new Date(),
): Promise<SocialAggregate[]> {
  if (!isPersistenceEnabled()) return [];
  return withFileLock(FILES.mentionAggregates, async () => {
    const mentions = await readPersistedMentions();
    const aggregates = buildAggregates(mentions, now);
    await writeJsonlFile<SocialAggregate>(
      FILES.mentionAggregates,
      aggregates,
    );
    return aggregates;
  });
}
