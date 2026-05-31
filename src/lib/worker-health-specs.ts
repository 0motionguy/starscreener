export interface SlugHealthSpec {
  slug: string;
  fetcher: string;
  cadenceMin: number;
  /** True if this slug is allowed to lag without raising an alert (e.g. weekly). */
  slowMoving?: boolean;
  /**
   * Advisory slugs are useful diagnostics but do not make the fleet unhealthy.
   * They are either credential-dependent catalogs, third-party mirrors, or
   * non-critical enrichment feeds.
   */
  blocking?: boolean;
}

export interface DisabledSlugHealthSpec {
  slug: string;
  fetcher: string;
  reason: string;
}

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
  { slug: "funding-news", fetcher: "funding-news", cadenceMin: 360 },
  { slug: "collection-rankings", fetcher: "collection-rankings", cadenceMin: 360, blocking: false },

  // daily - operator-curated mirrors + once-a-day enrichment
  { slug: "manual-repos", fetcher: "manual-repos", cadenceMin: 60 * 24 },
  { slug: "revenue-manual-matches", fetcher: "revenue-manual-matches", cadenceMin: 60 * 24 },
  { slug: "npm-packages", fetcher: "npm-packages", cadenceMin: 60 * 24 },
  { slug: "revenue-benchmarks", fetcher: "revenue-benchmarks", cadenceMin: 60 * 24, blocking: false },

  // weekly - slow-moving baselines
  // Live Reddit collection is paused; baselines remain tracked as a separate
  // slow-moving snapshot until the OAuth-backed live collector is re-enabled.
  { slug: "reddit-baselines", fetcher: "reddit-baselines", cadenceMin: 60 * 24 * 7, slowMoving: true },

];

export const WORKER_HEALTH_DISABLED_SPECS: ReadonlyArray<DisabledSlugHealthSpec> = [
  {
    slug: "huggingface-trending",
    fetcher: "scrape-huggingface",
    reason:
      "workflow-owned script output; no registered live worker producer, tracked by cron freshness",
  },
  {
    slug: "trending-mcp",
    fetcher: "mcp-registry-official+glama+pulsemcp+smithery",
    reason:
      "legacy MCP roster has no registered live worker producer; disabled until rollup fetcher lands",
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
