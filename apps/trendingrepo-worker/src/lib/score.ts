// TypeScript mirror of supabase/migrations/*_init.sql > trending_score().
// SQL parity test in tests/sql/trending-score.test.ts asserts equivalence.

export const HALF_LIFE_DAYS = 14;

export const WEIGHTS = {
  downloads: 0.40,
  velocity: 0.25,
  popularity: 0.20,
  recency: 0.10,
  crossSource: 0.05,
} as const;

export function recencyDecay(lastModified: Date | null | undefined, halfLifeDays = HALF_LIFE_DAYS): number {
  if (!lastModified) return 0;
  const ageMs = Date.now() - lastModified.getTime();
  if (ageMs <= 0) return 1;
  const ageDays = ageMs / 86_400_000;
  return Math.exp((-Math.LN2 * ageDays) / halfLifeDays);
}

export function zScore(value: number, mean: number, stddev: number): number {
  if (!Number.isFinite(stddev) || stddev === 0) return 0;
  return (value - mean) / stddev;
}

export interface CompositeInput {
  downloads_7d: number;
  velocity_delta_7d: number;
  absolute_popularity: number;
  last_modified: Date | null;
  cross_source_count: number;
}

export interface PerTypeStats {
  mu_d: number;
  sd_d: number;
  mu_v: number;
  sd_v: number;
  mu_p: number;
  sd_p: number;
  max_cs: number;
  n: number;
}

export function composite(x: CompositeInput, s: PerTypeStats): number {
  const recency = recencyDecay(x.last_modified);
  const crossSourceComponent = s.max_cs > 0 ? x.cross_source_count / s.max_cs : 0;
  if (s.n < 2) {
    return WEIGHTS.recency * recency + WEIGHTS.crossSource * crossSourceComponent;
  }
  return (
    WEIGHTS.downloads * zScore(x.downloads_7d, s.mu_d, s.sd_d) +
    WEIGHTS.velocity * zScore(x.velocity_delta_7d, s.mu_v, s.sd_v) +
    WEIGHTS.popularity * zScore(x.absolute_popularity, s.mu_p, s.sd_p) +
    WEIGHTS.recency * recency +
    WEIGHTS.crossSource * crossSourceComponent
  );
}

export function computeStats(items: ReadonlyArray<CompositeInput>): PerTypeStats {
  const n = items.length;
  if (n === 0) {
    return { mu_d: 0, sd_d: 0, mu_v: 0, sd_v: 0, mu_p: 0, sd_p: 0, max_cs: 0, n: 0 };
  }
  const sums = items.reduce(
    (acc, x) => ({
      d: acc.d + x.downloads_7d,
      v: acc.v + x.velocity_delta_7d,
      p: acc.p + x.absolute_popularity,
      maxCs: Math.max(acc.maxCs, x.cross_source_count),
    }),
    { d: 0, v: 0, p: 0, maxCs: 0 },
  );
  const mu_d = sums.d / n;
  const mu_v = sums.v / n;
  const mu_p = sums.p / n;
  const variances = items.reduce(
    (acc, x) => ({
      d: acc.d + (x.downloads_7d - mu_d) ** 2,
      v: acc.v + (x.velocity_delta_7d - mu_v) ** 2,
      p: acc.p + (x.absolute_popularity - mu_p) ** 2,
    }),
    { d: 0, v: 0, p: 0 },
  );
  const denom = n > 1 ? n - 1 : 1;
  return {
    mu_d,
    sd_d: Math.sqrt(variances.d / denom),
    mu_v,
    sd_v: Math.sqrt(variances.v / denom),
    mu_p,
    sd_p: Math.sqrt(variances.p / denom),
    max_cs: sums.maxCs,
    n,
  };
}
