// 24-hour signal volume bucketing.
//
// Takes SignalItem[] from all 8 sources, buckets each item into one of 24
// hourly UTC slots based on its postedAtMs, and returns per-source counts
// + totals + peak/quiet hours. Rendered by VolumeAreaChart as a stacked
// area chart matching the mockup's // 01 SIGNAL VOLUME panel.

import type { SignalItem, SourceKey } from "./types";

export interface HourBucket {
  /** UTC hour 0..23. */
  hour: number;
  hn: number;
  github: number;
  x: number;
  reddit: number;
  bluesky: number;
  devto: number;
  claude: number;
  openai: number;
  total: number;
}

export interface VolumeSummary {
  buckets: HourBucket[];
  /** Sum of items across the entire 24h. */
  totalItems: number;
  /** Hour (0..23) with highest total. */
  peakHour: number;
  /** Total at peak hour. */
  peakTotal: number;
  /** Hour with lowest total (when totalItems > 0). */
  quietHour: number;
  quietTotal: number;
  /** Source with highest aggregate count over the window. */
  dominantSource: SourceKey;
  /** Per-source 24h totals (used by KPI strip + footer). */
  perSource: Record<SourceKey, number>;
  /** % of items vs prior 24h — null when we don't have prior data. */
  changePct: number | null;
}

function emptyBucket(hour: number): HourBucket {
  return {
    hour,
    hn: 0,
    github: 0,
    x: 0,
    reddit: 0,
    bluesky: 0,
    devto: 0,
    claude: 0,
    openai: 0,
    total: 0,
  };
}

const SOURCE_TO_KEY: Record<SourceKey, keyof HourBucket> = {
  hn: "hn",
  github: "github",
  x: "x",
  reddit: "reddit",
  bluesky: "bluesky",
  devto: "devto",
  claude: "claude",
  openai: "openai",
};

export interface BuildVolumeOpts {
  nowMs?: number;
  /** Optional prior-24h count for change% calculation. */
  priorTotal?: number;
}

export function buildVolume(
  items: SignalItem[],
  opts: BuildVolumeOpts = {},
): VolumeSummary {
  const nowMs = opts.nowMs ?? Date.now();
  const buckets: HourBucket[] = [];
  for (let i = 0; i < 24; i++) buckets.push(emptyBucket(i));

  const perSource: Record<SourceKey, number> = {
    hn: 0,
    github: 0,
    x: 0,
    reddit: 0,
    bluesky: 0,
    devto: 0,
    claude: 0,
    openai: 0,
  };

  const cutoff = nowMs - 24 * 3_600_000;
  let total = 0;

  for (const item of items) {
    if (!item.postedAtMs || item.postedAtMs < cutoff || item.postedAtMs > nowMs)
      continue;
    const hour = new Date(item.postedAtMs).getUTCHours();
    const key = SOURCE_TO_KEY[item.source];
    if (!key) continue;
    const bucket = buckets[hour];
    (bucket[key] as number) += 1;
    bucket.total += 1;
    perSource[item.source] += 1;
    total += 1;
  }

  // Peak / quiet
  let peakHour = 0;
  let peakTotal = 0;
  let quietHour = 0;
  let quietTotal = total > 0 ? Number.POSITIVE_INFINITY : 0;
  for (const b of buckets) {
    if (b.total > peakTotal) {
      peakTotal = b.total;
      peakHour = b.hour;
    }
    if (total > 0 && b.total < quietTotal) {
      quietTotal = b.total;
      quietHour = b.hour;
    }
  }
  if (quietTotal === Number.POSITIVE_INFINITY) quietTotal = 0;

  // Dominant source
  let dominantSource: SourceKey = "hn";
  let dominantCount = -1;
  for (const [k, v] of Object.entries(perSource) as [SourceKey, number][]) {
    if (v > dominantCount) {
      dominantCount = v;
      dominantSource = k;
    }
  }

  let changePct: number | null = null;
  if (typeof opts.priorTotal === "number" && opts.priorTotal > 0) {
    changePct = Math.round(((total - opts.priorTotal) / opts.priorTotal) * 1000) / 10;
  }

  return {
    buckets,
    totalItems: total,
    peakHour,
    peakTotal,
    quietHour,
    quietTotal,
    dominantSource,
    perSource,
    changePct,
  };
}

export const SOURCE_LABELS: Record<SourceKey, string> = {
  hn: "HN",
  github: "GH",
  x: "X",
  reddit: "RDT",
  bluesky: "BSKY",
  devto: "DEV",
  claude: "CLA",
  openai: "OAI",
};
