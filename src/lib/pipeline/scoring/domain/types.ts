// TrendingRepo Pipeline — cross-domain trending engine: shared types.
//
// Each domain (skills, MCP, HF models/datasets/spaces, arXiv, github-repo)
// has its own pure scorer that emits a `ScoredItem<T>`. The cross-domain
// assembler then percentile-ranks raw scores within each domain to produce
// the final 0..100 `momentum` field on `DomainScore`.
//
// Pure types + a generic weight renormalizer used by every per-domain
// scorer to handle dropped components.

export type DomainKey =
  | "github-repo"
  | "skill"
  | "mcp"
  | "hf-model"
  | "hf-dataset"
  | "hf-space"
  | "arxiv";

export interface DomainItem {
  domainKey: DomainKey;
  id: string;
  joinKeys: {
    repoFullName?: string; // "owner/name"
    npmName?: string;
    arxivId?: string; // bare id, e.g. "2305.12345"
    hfModelId?: string; // "org/model"
  };
}

export interface PrimaryMetric {
  name: string; // canonical key, e.g. "downloads_7d"
  value: number;
  label: string; // human-readable, e.g. "Downloads"
}

export interface DomainScore {
  item: DomainItem;
  rawComponents: Record<string, number>; // each 0..100
  weights: Record<string, number>; // sums to 1.0 after renormalization
  rawScore: number; // weighted sum, 0..100
  momentum: number; // post-cross-domain percentile, 0..100
  primaryMetric: PrimaryMetric;
  explanation: string;
}

export interface ScoredItem<T extends DomainItem> {
  item: T;
  rawComponents: Record<string, number>;
  rawScore: number;
  primaryMetric: PrimaryMetric;
  weights: Record<string, number>;
  explanation: string;
}

export interface DomainScorer<T extends DomainItem> {
  domainKey: DomainKey;
  defaultWeights: Readonly<Record<string, number>>;
  computeRaw(items: T[]): ScoredItem<T>[];
}

// ---------------------------------------------------------------------------
// Generic weight helpers used by every per-domain scorer.
// ---------------------------------------------------------------------------

/**
 * Re-scale an arbitrary `Record<string, number>` weight bag so it sums to 1.0.
 * If the input is empty or sums to 0, returns an empty object — callers that
 * dropped every component should treat that as "no signal" and emit rawScore 0.
 */
export function normalizeWeights(
  w: Record<string, number>,
): Record<string, number> {
  const entries = Object.entries(w).filter(
    ([, v]) => Number.isFinite(v) && v > 0,
  );
  const total = entries.reduce((acc, [, v]) => acc + v, 0);
  if (!Number.isFinite(total) || total <= 0) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of entries) {
    out[k] = v / total;
  }
  return out;
}

/**
 * Compute the weighted sum of a components bag with the matching weights.
 * Components missing from `weights` are skipped. Result is in 0..100 if every
 * component is in 0..100 and weights sum to 1.0.
 */
export function weightedSum(
  components: Record<string, number>,
  weights: Record<string, number>,
): number {
  let total = 0;
  for (const [k, w] of Object.entries(weights)) {
    const v = components[k];
    if (Number.isFinite(v) && Number.isFinite(w)) {
      total += v * w;
    }
  }
  return total;
}

/**
 * Build a short "<top1 label> N, <top2 label> N" explanation string from the
 * weighted contributions. Pure helper used by every scorer.
 */
export function topContributorsExplanation(
  rawComponents: Record<string, number>,
  weights: Record<string, number>,
  labels: Record<string, string>,
  rawScore: number,
): string {
  const contributions = Object.entries(weights)
    .map(([k, w]) => ({
      key: k,
      raw: rawComponents[k] ?? 0,
      contribution: (rawComponents[k] ?? 0) * w,
    }))
    .filter((c) => c.raw > 0)
    .sort((a, b) => b.contribution - a.contribution);

  const top = contributions.slice(0, 2);
  if (top.length === 0) return `Score ${rawScore.toFixed(1)}`;
  const phrases = top.map((c) => {
    const label = labels[c.key] ?? c.key;
    return `${label} ${Math.round(c.raw)}`;
  });
  return `Score ${rawScore.toFixed(1)} — ${phrases.join(", ")}`;
}
