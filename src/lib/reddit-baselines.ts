// Reddit subreddit baselines loader.
//
// Reads data/reddit-baselines.json (produced weekly by
// scripts/compute-reddit-baselines.mjs) and exposes a typed API for
// per-post ratio computation.
//
// Baseline semantics:
//   ratio = post.upvotes / max(1, baseline.median_upvotes)
//   tier:
//     > 10  → "breakout"
//     > 3   → "above-average"
//     >= 1  → "normal"
//     else  → "below-average"
// When the sub has no baseline (new sub, or baseline fetch failed), tier
// is "no-baseline" and ratio is null; the UI should dim or de-rank these
// rather than treating them as "normal".

import baselinesData from "../../data/reddit-baselines.json";
import { getDataStore } from "./data-store";

export type BaselineConfidence = "high" | "medium" | "low";

export type BaselineTier =
  | "breakout"
  | "above-average"
  | "normal"
  | "below-average"
  | "no-baseline";

export interface SubredditBaseline {
  median_upvotes: number;
  mean_upvotes: number;
  p75_upvotes: number;
  p90_upvotes: number;
  median_comments: number;
  sample_size: number;
  actual_window_days: number;
  confidence: BaselineConfidence;
}

export interface BaselinesFile {
  lastComputedAt: string;
  windowDays: number;
  subredditsRequested: number;
  subredditsSucceeded: number;
  errors: Record<string, string>;
  baselines: Record<string, SubredditBaseline>;
}

// Mutable in-memory cache — seeded from the bundled JSON, replaced by Redis
// payloads via refreshRedditBaselinesFromStore().
let data: BaselinesFile = baselinesData as unknown as BaselinesFile;

// Backwards-compat constants captured at module-load time. New callers should
// use the getter equivalents below to see post-refresh values.
export const redditBaselinesComputedAt: string = data.lastComputedAt;
export const redditBaselinesCold: boolean =
  data.subredditsSucceeded === 0;

export function getRedditBaselinesComputedAt(): string {
  return data.lastComputedAt;
}

export function isRedditBaselinesCold(): boolean {
  return data.subredditsSucceeded === 0;
}

export function getBaseline(sub: string): SubredditBaseline | null {
  return data.baselines[sub] ?? null;
}

export function getBaselinesFile(): BaselinesFile {
  return data;
}

export interface BaselineRatioResult {
  ratio: number | null;
  tier: BaselineTier;
  confidence: BaselineConfidence | null;
}

export function computeBaselineRatio(
  sub: string,
  upvotes: number,
): BaselineRatioResult {
  const baseline = getBaseline(sub);
  if (!baseline || baseline.sample_size === 0) {
    return { ratio: null, tier: "no-baseline", confidence: null };
  }

  // Degenerate case: median = 0 (sub is mostly downvoted/zero-score). Fall
  // back to p75 so we still get a meaningful anchor. If p75 is also 0, we
  // can't rank — return null ratio but keep confidence so UI can label it.
  const anchor =
    baseline.median_upvotes > 0 ? baseline.median_upvotes : baseline.p75_upvotes;
  if (anchor <= 0) {
    return { ratio: null, tier: "no-baseline", confidence: baseline.confidence };
  }

  const ratio = upvotes / anchor;
  let tier: BaselineTier;
  if (ratio > 10) tier = "breakout";
  else if (ratio > 3) tier = "above-average";
  else if (ratio >= 1) tier = "normal";
  else tier = "below-average";

  return {
    ratio: Math.round(ratio * 100) / 100,
    tier,
    confidence: baseline.confidence,
  };
}

// ---------------------------------------------------------------------------
// Phase 4: refresh hook — pull latest reddit-baselines payload from data-store.
// ---------------------------------------------------------------------------

let inflight: Promise<{ source: string; ageMs: number }> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

export async function refreshRedditBaselinesFromStore(): Promise<{
  source: string;
  ageMs: number;
}> {
  if (inflight) return inflight;
  if (
    Date.now() - lastRefreshMs < MIN_REFRESH_INTERVAL_MS &&
    lastRefreshMs > 0
  ) {
    return { source: "memory", ageMs: Date.now() - lastRefreshMs };
  }
  inflight = (async () => {
    const result = await getDataStore().read<BaselinesFile>("reddit-baselines");
    if (result.data && result.source !== "missing") {
      data = result.data;
    }
    lastRefreshMs = Date.now();
    return { source: result.source, ageMs: result.ageMs };
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
