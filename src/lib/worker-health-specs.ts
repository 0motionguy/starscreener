export interface SlugHealthSpec {
  slug: string;
  fetcher: string;
  cadenceMin: number;
  /** True if this slug is allowed to lag without raising an alert (e.g. weekly). */
  slowMoving?: boolean;
  /**
   * Triage label retained in the response for operator context. The fleet
   * health result is zero-tolerance across every active tracked slug; optional
   * or intentionally paused producers belong in WORKER_HEALTH_DISABLED_SPECS.
   */
  blocking?: boolean;
}

export interface DisabledSlugHealthSpec {
  slug: string;
  fetcher: string;
  reason: string;
}

export interface DynamicOutputHealthSpec {
  fetcher: string;
  outputPattern: string;
  markerSlug: string;
}

export const WORKER_DYNAMIC_OUTPUT_HEALTH_SPECS: ReadonlyArray<DynamicOutputHealthSpec> = [
  {
    fetcher: "star-activity",
    outputPattern: "star-activity:<owner>__<name>",
    markerSlug: "worker-health:star-activity",
  },
  {
    fetcher: "velocity-backfill",
    outputPattern: "star-activity:<owner>__<name>",
    markerSlug: "worker-health:velocity-backfill",
  },
  {
    fetcher: "repo-community-profile",
    outputPattern: "repo-community:<owner>__<name>",
    markerSlug: "worker-health:repo-community-profile",
  },
  {
    fetcher: "velocity-refresh",
    outputPattern: "star-activity:<owner>__<name>",
    markerSlug: "worker-health:velocity-refresh",
  },
  {
    fetcher: "velocity-seed",
    outputPattern: "star-activity:<owner>__<name>",
    markerSlug: "worker-health:velocity-seed",
  },
];

export const WORKER_HEALTH_SPECS: ReadonlyArray<SlugHealthSpec> = [
  // hourly + faster - these are the freshness-sensitive workhorses
  { slug: "hn-pulse", fetcher: "hn-pulse", cadenceMin: 10 },
  { slug: "trending", fetcher: "oss-trending", cadenceMin: 60 },
  { slug: "hot-collections", fetcher: "oss-trending", cadenceMin: 60, blocking: false },
  { slug: "recent-repos", fetcher: "recent-repos", cadenceMin: 60 },
  { slug: "deltas", fetcher: "deltas", cadenceMin: 60 },
  { slug: "repo-metadata", fetcher: "repo-metadata", cadenceMin: 60, blocking: false },
  { slug: "repo-profiles", fetcher: "repo-profiles", cadenceMin: 60 },
  { slug: "trendshift-daily", fetcher: "trendshift-daily", cadenceMin: 60, blocking: false },
  { slug: "engagement-composite", fetcher: "engagement-composite", cadenceMin: 60 },
  { slug: "consensus-trending", fetcher: "consensus-trending", cadenceMin: 60 },
  // TrustMRR catalog/meta are full daily snapshots; hourly TrustMRR ticks only
  // refresh revenue-overlays. Keep the catalog cadence aligned to the producer.
  { slug: "trustmrr-startups", fetcher: "trustmrr", cadenceMin: 60 * 24, blocking: false },
  { slug: "trustmrr-startups:meta", fetcher: "trustmrr", cadenceMin: 60 * 24, blocking: false },
  { slug: "revenue-overlays", fetcher: "trustmrr", cadenceMin: 60, blocking: false },
  { slug: "hackernews-trending", fetcher: "hackernews", cadenceMin: 60 },
  { slug: "hackernews-repo-mentions", fetcher: "hackernews", cadenceMin: 60 },
  { slug: "bluesky-trending", fetcher: "bluesky", cadenceMin: 60 },
  { slug: "bluesky-mentions", fetcher: "bluesky", cadenceMin: 60 },
  { slug: "lobsters-trending", fetcher: "lobsters", cadenceMin: 60 },
  { slug: "lobsters-mentions", fetcher: "lobsters", cadenceMin: 60, blocking: false },

  // few-hours cadence
  { slug: "producthunt-launches", fetcher: "producthunt", cadenceMin: 360, blocking: false },
  { slug: "funding-news", fetcher: "funding-news", cadenceMin: 180 },
  { slug: "collection-rankings", fetcher: "collection-rankings", cadenceMin: 360, blocking: false },
  { slug: "funding-news-crunchbase", fetcher: "crunchbase", cadenceMin: 180 },
  { slug: "funding-news-sec", fetcher: "sec-form-d", cadenceMin: 180 },
  { slug: "consensus-verdicts", fetcher: "consensus-analyst", cadenceMin: 60 },
  { slug: "devto-mentions", fetcher: "devto", cadenceMin: 720 },
  { slug: "devto-trending", fetcher: "devto", cadenceMin: 720 },
  { slug: "twitter-repo-signals", fetcher: "twitter", cadenceMin: 60 },
  { slug: "aa-llms", fetcher: "artificialanalysis", cadenceMin: 360 },
  { slug: "openrouter-models", fetcher: "openrouter-models", cadenceMin: 360 },
  { slug: "repo-registry", fetcher: "repo-registry", cadenceMin: 60 },
  { slug: "mentions-ledger", fetcher: "mentions-ledger", cadenceMin: 30 },
  { slug: "repo-mentions-detail-rollup", fetcher: "cross-source-sweep", cadenceMin: 60 * 24 },
  // velocity-refresh updates this shared slug every 40 minutes; keep the
  // health gate tight enough to catch the OSS-Insight-independent backbone.
  { slug: "star-activity-deltas", fetcher: "velocity-refresh", cadenceMin: 60 },
  { slug: "worker-health:velocity-refresh", fetcher: "velocity-refresh", cadenceMin: 60 },
  { slug: "editorial-best", fetcher: "editorial-writer", cadenceMin: 60 * 24 },
  { slug: "editorial-categories", fetcher: "editorial-categories", cadenceMin: 60 * 24 },
  { slug: "editorial-compare", fetcher: "editorial-compare", cadenceMin: 60 * 24 },
  { slug: "editorial-alternatives", fetcher: "editorial-alternatives", cadenceMin: 60 * 24 },

  // daily - operator-curated mirrors + once-a-day enrichment
  { slug: "manual-repos", fetcher: "manual-repos", cadenceMin: 60 * 24 },
  { slug: "worker-health:star-activity", fetcher: "star-activity", cadenceMin: 60 * 24 },
  { slug: "worker-health:velocity-backfill", fetcher: "velocity-backfill", cadenceMin: 60 * 24 },
  { slug: "worker-health:velocity-seed", fetcher: "velocity-seed", cadenceMin: 60 * 24 },
  { slug: "worker-health:repo-community-profile", fetcher: "repo-community-profile", cadenceMin: 60 },
  { slug: "revenue-manual-matches", fetcher: "revenue-manual-matches", cadenceMin: 60 * 24 },
  { slug: "npm-packages", fetcher: "npm-packages", cadenceMin: 60 * 24 },
  { slug: "revenue-benchmarks", fetcher: "revenue-benchmarks", cadenceMin: 60 * 24, blocking: false },
  { slug: "stars-by-category-daily", fetcher: "stars-by-category", cadenceMin: 60 * 24 },

  // weekly - slow-moving baselines
  { slug: "lmarena-text", fetcher: "lmarena", cadenceMin: 60 * 24 * 7, slowMoving: true, blocking: false },

];

export const WORKER_PAYLOAD_HEALTH_SLUGS: ReadonlySet<string> = new Set(
  WORKER_HEALTH_SPECS.map((spec) => spec.slug),
);

export const WORKER_HEALTH_DISABLED_SPECS: ReadonlyArray<DisabledSlugHealthSpec> = [
  {
    slug: "openrouter-usage",
    fetcher: "openrouter-usage",
    reason:
      "OpenRouter removed the keyless /api/frontend RSC routes this fetcher relied on (verified 404 on 2026-06-10; the slug had no OPENROUTER_API_KEY for the official datasets endpoint). The cache-preserve guard keeps the last-known-good weekly chart visible, but the producer cannot refresh — pause it from the blocking gate until either an OpenRouter data key is provisioned or the official datasets aggregation is implemented (see fetcher TODO).",
  },
  {
    slug: "reddit-mentions",
    fetcher: "reddit",
    reason:
      "Reddit collection is intentionally paused end-to-end on HOSTUP; stale historical mentions must not be treated as worker-owned",
  },
  {
    slug: "reddit-all-posts",
    fetcher: "reddit",
    reason:
      "live Reddit collector is intentionally paused on HOSTUP; do not treat the stale historical all-posts slug as worker-owned",
  },
  {
    slug: "reddit-baselines",
    fetcher: "reddit-baselines",
    reason:
      "Reddit baselines are intentionally paused with the rest of Reddit; the fetcher hits Reddit upstreams and must not keep the topic alive",
  },
  {
    slug: "funding-news-x",
    fetcher: "x-funding",
    reason:
      "x-funding is intentionally paused on HOSTUP because the only producer path uses Apify and must not publish empty freshness payloads",
  },
  {
    slug: "github-events:_index",
    fetcher: "github-events",
    reason:
      "github-events fetcher code exists but is not registered in the live worker fleet",
  },
  {
    slug: "trending-paper",
    fetcher: "arxiv",
    reason:
      "retired Supabase-backed worker leaderboard; active arxiv surface is arxiv-recent, not this stale trending-paper slug",
  },
  {
    slug: "trending-post",
    fetcher: "ai-blogs",
    reason:
      "retired Supabase-backed worker leaderboard; active RSS/blog surfaces use their own Redis slugs, not this stale trending-post slug",
  },
  {
    slug: "huggingface-trending",
    fetcher: "scrape-huggingface",
    reason:
      "workflow-owned script output; no registered live worker producer, disabled from live worker and cron freshness until ported to HOSTUP",
  },
  {
    slug: "trending-mcp",
    fetcher: "mcp-registry-official+glama+pulsemcp+smithery",
    reason:
      "legacy MCP roster has no registered live worker producer; disabled until rollup fetcher lands",
  },
  {
    slug: "mcp-downloads",
    fetcher: "npm-downloads",
    reason:
      "MCP package downloads depend on the retired trending-mcp roster; worker fetcher is not registered until the roster is rebuilt",
  },
  {
    slug: "mcp-downloads-pypi",
    fetcher: "pypi-downloads",
    reason:
      "MCP package downloads depend on the retired trending-mcp roster; worker fetcher is not registered until the roster is rebuilt",
  },
  {
    slug: "mcp-dependents",
    fetcher: "npm-dependents",
    reason:
      "MCP dependent counts depend on the retired trending-mcp roster; worker fetcher is not registered until the roster is rebuilt",
  },
  {
    slug: "trending-skill",
    fetcher: "claude-skills",
    reason:
      "legacy skill roster has no registered live worker producer; disabled until source is ported",
  },
  {
    slug: "trending-skill-sh",
    fetcher: "skills-sh",
    reason:
      "legacy skill roster has no registered live worker producer; disabled until source is ported",
  },
  {
    slug: "trending-skill-skillsmp",
    fetcher: "skillsmp",
    reason:
      "legacy skill roster has no registered live worker producer; disabled until source is ported",
  },
  {
    slug: "trending-skill-smithery",
    fetcher: "smithery-skills",
    reason:
      "legacy skill roster has no registered live worker producer; disabled until source is ported",
  },
  {
    slug: "trending-skill-lobehub",
    fetcher: "lobehub-skills",
    reason:
      "legacy skill roster has no registered live worker producer; disabled until source is ported",
  },
];
