// Period-start-based star-velocity percentage — the single source of truth for
// the "+N stars / +X%" growth figure shown across the velocity surfaces.
//
// THE BUG THIS REPLACES
// Every velocity surface used to compute `delta / stars_now * 100` — the growth
// as a fraction of the CURRENT total. That understates growth, badly so for fast
// movers: a repo that went 100 → 200 stars in 7d grew +100%, but `delta/stars`
// reports +50%. Fast movers are exactly what a velocity board exists to surface,
// so the base must be the count at the START of the window: `stars_now - delta`.
//
// Returns null when there's no meaningful % to display:
//   - delta is 0 or non-finite (flat → show no %),
//   - the period-start base collapses to < 1 — a young/explosive repo that gained
//     ~all of its stars inside the window. "+93,700%" is noise; callers fall back
//     to the absolute ("+937"), which already tells the story.

export function velocityPct(delta: number, stars: number): number | null {
  if (!Number.isFinite(delta) || delta === 0) return null;
  if (!Number.isFinite(stars)) return null;
  const base = stars - delta; // stars at the start of the period
  if (base < 1) return null;
  return (delta / base) * 100;
}

/** Formatted "+X.X%" / "-X.X%"; "" when {@link velocityPct} returns null. */
export function formatVelocityPct(delta: number, stars: number): string {
  const pct = velocityPct(delta, stars);
  if (pct === null) return '';
  return pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;
}
