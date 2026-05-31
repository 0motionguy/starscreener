// Type contracts for the engagement-composite fetcher.
//
// Two layers:
//   1. NormalizedRepoSignals — internal, post-extraction shape used by
//      scoring.ts. Each component holds the raw aggregated value pulled
//      from one upstream slug. Missing values are 0 (never null) so the
//      scoring pipeline can rank cold repos consistently.
//   2. EngagementCompositePayload — the durable shape published to
//      ss:data:v1:engagement-composite. Consumers (the /api/scoring/
//      engagement route, the homepage hero card) read this shape.

export type ComponentKey =
  | 'hn'
  | 'reddit'
  | 'bluesky'
  | 'devto'
  | 'npm'
  | 'ghStars'
  | 'ph';

export const COMPONENT_KEYS: readonly ComponentKey[] = [
  'hn',
  'reddit',
  'bluesky',
  'devto',
  'npm',
  'ghStars',
  'ph',
] as const;

/** Per-repo raw aggregated signal values prior to normalization. */
export interface NormalizedRepoSignals {
  fullName: string;
  hn: number;        // sum of HN post scores in 72h window
  reddit: number;    // sum of reddit post scores in 7d window
  bluesky: number;   // repost+like sum in 7d window
  devto: number;     // article reaction count in 7d window
  npm: number;       // npm weekly download count for any matched package
  ghStars: number;   // weekly star velocity (delta_7d, falling back to delta_24h * 7)
  ph: number;        // PH vote count for matching launch
}

export interface ComponentScore {
  raw: number;
  normalized: number; // 0..1 after percentile / log-normalization
}

export interface EngagementCompositeItem {
  fullName: string;
  rank: number;       // 1-based, sorted by compositeScore desc
  compositeScore: number; // 0..100, 1 decimal
  components: Record<ComponentKey, ComponentScore>;
}

export interface EngagementCompositePayload {
  computedAt: string;
  cohortSize: number;          // total repos seen across all upstream slugs
  itemCount: number;           // length of `items` (capped at TOP_LIMIT)
  weights: Record<ComponentKey, number>;
  items: EngagementCompositeItem[];
}
