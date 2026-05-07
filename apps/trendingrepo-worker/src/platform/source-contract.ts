/**
 * Every Fetcher must satisfy SourceContract; not every SourceContract has a
 * Fetcher (standalone scripts and user-input flows have no Fetcher).
 *
 * SourceContract is the metadata superset over `Fetcher` (lib/types.ts).
 * Phase 1 (Move 1) of the Source Platform migration declares this type,
 * the audit JSON conforming to it, and the verification harness that proves
 * registry coverage. Nothing in the running system changes in Phase 1.
 *
 * Cost aggregation rule for parent rows with providers[]:
 *   `cost_signal_metric` reflects the PRIMARY provider's cost class. Chain
 *   fall-through to a free fallback is a degradation signal Move 3 tracks
 *   per-run, not a steady-state cost event. e.g. `twitter-signals` parent
 *   declares `cost_signal_metric.type: 'apify_units'` even though the chain
 *   has free fallbacks (web/nitter/fixture). Each provider's `cost_class`
 *   is recorded individually in the providers[] sub-array for routing.
 *
 * See:
 *   - ~/.claude/plans/hidden-pondering-meadow.md (approved Phase 1 plan)
 *   - docs/SOURCE-REGISTRY-PROPOSAL.md (Move 1 implementation proposal — pending)
 *   - apps/trendingrepo-worker/src/lib/types.ts (runtime Fetcher + RunResult)
 */

export type SourceCategory =
  | 'repo-derived'
  | 'social'
  | 'package'
  | 'model'
  | 'mcp'
  | 'skill'
  | 'funding'
  | 'research'
  | 'ops'
  | 'user-input';

export type SourceKind = 'collector' | 'enrichment' | 'snapshot' | 'health';

export type SourceState = 'active' | 'paused' | 'deprecated' | 'intent-only';

export type CostSignalType =
  | 'usd'
  | 'rate_limit_pct'
  | 'apify_units'
  | 'pat_quota_pct'
  | 'none';

export type CostSignalScope = 'day' | 'hour' | 'month';

export interface CostSignalMetric {
  type: CostSignalType;
  cap?: number;
  scope?: CostSignalScope;
}

export type RateLimitScope = 'ip' | 'token' | 'pool';

export interface RateLimit {
  per_hour?: number;
  scope: RateLimitScope;
}

export type AuthScheme =
  | 'github_pat_pool'
  | 'apify_token'
  | 'twitter_web_cookies'
  | 'firecrawl'
  | 'supabase_service'
  | 'none';

export type CardinalitySource = 'watchlist' | 'static' | 'enum';

/**
 * Static slug list (e.g. ['oss-trending']) OR fan-out pattern
 * (e.g. {pattern: 'mcp-downloads:<package>', cardinality_source: 'watchlist'}).
 * One row per slug family — concrete-slug enumeration is a Move 3 concern.
 */
export type PrimaryOutputKeys =
  | string[]
  | {
      pattern: string;
      index_key?: string;
      cardinality_source: CardinalitySource;
    };

export type OutputRecordShape =
  | 'ranked_list'
  | 'event_stream'
  | 'metric_snapshot'
  | 'mention_feed'
  | 'metadata_table'
  | 'extracted_signal';

export type ConsensusRole = 'list' | 'mention-feed' | 'metadata' | 'event-stream';

export type FallbackStrategy =
  | 'cache'
  | 'skip'
  | 'mark-degraded'
  | 'editorial-seed'
  | 'provider-chain'
  | 'none';

export type ProviderRole = 'primary' | 'fallback';

export interface SourceProvider {
  id: string;
  role: ProviderRole;
  cost_class: CostSignalType;
}

export type CanonicalEntityKind =
  | 'repo'
  | 'package'
  | 'model'
  | 'company'
  | 'mention'
  | 'event';

/**
 * The Source Contract — Phase 1, Move 1 of the Source Platform migration.
 *
 * 16 fields derived from a contract sufficiency stress-test against 5
 * representative fetchers (oss-trending, funding-news, github-events,
 * twitter-repo-signals, mcp-liveness). Every Fetcher must satisfy this
 * contract; standalone scripts and user-input flows declare a contract
 * without a Fetcher.
 */
export type SourceContract = {
  /** Stable slug; matches Fetcher.name when one exists. */
  id: string;
  category: SourceCategory;
  kind: SourceKind;
  state: SourceState;
  freshness_budget_ms: number;
  cost_signal_metric: CostSignalMetric;
  rate_limit?: RateLimit;
  /** GitHub handle / team slug; the literal 'UNASSIGNED' is allowed in Phase 1. */
  owner: string;
  upstream_url: string | string[] | 'multiple';
  auth_required: boolean;
  auth_scheme?: AuthScheme;
  /** Static slug list OR fan-out pattern. See PrimaryOutputKeys. */
  primary_output_keys: PrimaryOutputKeys;
  output_record_shape: OutputRecordShape;
  consensus_role?: ConsensusRole;
  /** Route paths or src/lib readers that consume this source's output. */
  consumer_surfaces: string[];
  /** Source ids that must run first. */
  depends_on: string[];
  supports_backfill: boolean;
  fallback_strategy: FallbackStrategy;
  /**
   * For multi-provider sources (e.g. twitter-signals: apify→web→nitter→fixture).
   * One contract row owns the chain; providers[] documents the ordered fallback.
   */
  providers?: SourceProvider[];
  /** Forward-compat for Move 2 (canonical entities + provenance). */
  writes_canonical_entity_kind?: CanonicalEntityKind[];
  /** For state='intent-only': what's the ship/delete question? */
  decision_pending?: string;
};
