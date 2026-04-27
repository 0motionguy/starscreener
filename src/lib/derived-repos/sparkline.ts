// Sparkline synthesis for the cold-start critical path.
//
// Every cold Vercel Lambda renders the homepage by walking derived-repos.ts;
// real snapshot history is unavailable on cold start, so these helpers
// produce a credible visual stand-in from the anchor deltas already present
// in the trending feed. Once the in-memory snapshotter has accumulated real
// datapoints, the synthesized curves are dropped in favor of the real ones
// (see callsite in derived-repos/index.ts).
//
// Pure functions. No I/O, no module-level state. Extracted from the original
// god module as Step 1 of the LIB-01 split (TECH_DEBT_AUDIT.md).

/**
 * Synthesize a 30-point daily sparkline from known deltas + stars_now.
 *
 * Anchors: today = stars_now, -1d = stars_now - delta_24h, -7d = stars_now -
 * delta_7d, -30d shrunk to -29d proportionally so the curve stays inside a
 * 30-point window. Intermediate days are linearly interpolated.
 */
export function synthesizeSparkline(
  starsNow: number,
  delta24h: number,
  delta7d: number,
  delta30d: number,
): number[] {
  if (starsNow <= 0) return [];

  // Anchor points keyed by days-ago (0 = today).
  const anchors = new Map<number, number>();
  anchors.set(0, starsNow);
  anchors.set(1, Math.max(0, starsNow - Math.max(0, delta24h)));
  anchors.set(7, Math.max(0, starsNow - Math.max(0, delta7d)));
  // Compress 30d onto the 29-days-ago slot so the curve shows the longer-term
  // slope while keeping exactly 30 points for the detail chart.
  const delta29d = Math.round(delta30d * (29 / 30));
  anchors.set(29, Math.max(0, starsNow - Math.max(0, delta29d)));

  const sortedKeys = Array.from(anchors.keys()).sort((a, b) => a - b);

  const series: number[] = [];
  for (let day = 29; day >= 0; day--) {
    // Find surrounding anchors for linear interpolation.
    let lower = sortedKeys[0];
    let upper = sortedKeys[sortedKeys.length - 1];
    for (const k of sortedKeys) {
      if (k <= day) lower = k;
      if (k >= day) {
        upper = k;
        break;
      }
    }
    const lo = anchors.get(lower)!;
    const hi = anchors.get(upper)!;
    if (lower === upper) {
      series.push(lo);
    } else {
      const t = (day - lower) / (upper - lower);
      series.push(Math.round(lo + (hi - lo) * t));
    }
  }
  return series;
}

/**
 * Synthesize a 30-point sparkline for a freshly discovered repo (no anchor
 * deltas yet). Uses age + current stars to project a credible accumulation
 * curve via a power-law that bumps recent days more than older ones.
 */
export function synthesizeRecentRepoSparkline(
  starsNow: number,
  createdAt: string,
): number[] {
  if (starsNow <= 0) return [];

  const created = Date.parse(createdAt);
  const ageDays = Number.isFinite(created)
    ? Math.max(1, Math.ceil((Date.now() - created) / 86_400_000))
    : 29;
  const activeSpan = Math.min(29, ageDays);
  const series: number[] = [];

  for (let dayAgo = 29; dayAgo >= 0; dayAgo--) {
    if (dayAgo > activeSpan) {
      series.push(0);
      continue;
    }
    const progress = activeSpan <= 0 ? 1 : (activeSpan - dayAgo) / activeSpan;
    series.push(Math.round(starsNow * Math.pow(progress, 0.85)));
  }

  series[series.length - 1] = starsNow;
  return series;
}
