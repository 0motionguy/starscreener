// Trending-score formulas — pure helpers, no I/O.
//
// Phase 5.3 lands the Reddit-hot ranking as a *parallel* sort key for the
// Reddit pipeline so we can A/B test it against the existing
// velocity * baselineRatio * log10(score) formula in scrape-reddit.mjs
// without committing to one across the whole pipeline. Actual computation
// is deferred to Phase 5.3-followup; here we only ship the formula + types.
//
// All functions in this module are pure (same input → same output, no
// side-effects, no clocks, no randomness).

/**
 * Reddit "hot" ranking formula. Decays old posts in favor of new ones,
 * with logarithmic vote scaling so a post with 10× the upvotes doesn't
 * outrank a fresh post by 10× the score.
 *
 * With score=0, reduces to `(epoch - constant) / 45000` — pure
 * chronological ordering, useful for our RSS-fallback degraded mode.
 *
 * Source: https://www.evanmiller.org/deriving-the-reddit-formula.html
 */
export function redditHotScore({
  score,
  createdUtc,
}: {
  score: number;
  createdUtc: number;
}): number {
  const order = Math.log10(Math.max(Math.abs(score), 1));
  const sign = score > 0 ? 1 : score < 0 ? -1 : 0;
  const seconds = createdUtc - 1134028003;
  return Math.round((sign * order + seconds / 45000) * 1e7) / 1e7;
}

/**
 * Hacker News gravity formula `(P-1) / (T+2)^G`. NOT recommended for our
 * use case (negative for P=0 → flips ordering), but exposed here for
 * comparison or future use.
 */
export function hnGravityScore({
  score,
  ageHours,
  gravity = 1.8,
}: {
  score: number;
  ageHours: number;
  gravity?: number;
}): number {
  return (score - 1) / Math.pow(ageHours + 2, gravity);
}
