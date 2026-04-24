// StarScreener DB — schema descriptors for the Postgres migration path.
//
// This file is **design-time documentation**. It is NOT wired to a live
// database. Today the pipeline persists to JSONL files via
// `src/lib/pipeline/storage/file-persistence.ts`. When we flip over to a
// real Postgres (Supabase / Neon / Turso), these descriptors map 1:1 onto
// Drizzle table definitions — the column names and types already match
// what `drizzle-kit` expects from `pgTable(...)`.
//
// See `docs/DATABASE.md` for the migration playbook.
//
// Why a plain object instead of drizzle imports? We don't want to pull
// drizzle-orm into the runtime bundle until we actually need it. Using
// a typed descriptor keeps this file compiling under `strict` with zero
// new dependencies and lets a future migration script read the descriptors
// to generate a Drizzle schema verbatim.

/**
 * Supported column types. Names mirror Postgres / Drizzle types so a future
 * codegen step can emit Drizzle declarations without a translation layer.
 */
export type ColumnType =
  | "text"
  | "integer"
  | "bigint"
  | "real"
  | "boolean"
  | "timestamp"
  | "jsonb";

/** Single column descriptor. */
export interface ColumnDescriptor {
  /** SQL column name (snake_case). */
  name: string;
  /** TypeScript / Drizzle type string. */
  type: ColumnType;
  /** When true, the column is `not null`. */
  notNull?: boolean;
  /** When true, the column is the primary key. */
  primaryKey?: boolean;
  /** Foreign-key target, formatted as `table.column`. */
  references?: string;
  /** Default SQL expression, e.g. `now()`. */
  defaultSql?: string;
  /** When true, a unique index is emitted on the column. */
  unique?: boolean;
}

/** Table descriptor — name + ordered column list. */
export interface TableDescriptor {
  name: string;
  columns: ColumnDescriptor[];
  /** Optional composite indices — emitted as `create index`. */
  indices?: { name: string; columns: string[]; unique?: boolean }[];
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/**
 * Canonical repo metadata — one row per tracked repository. Maps directly
 * onto `Repo` in `src/lib/types.ts`.
 */
export const repos: TableDescriptor = {
  name: "repos",
  columns: [
    { name: "id", type: "text", primaryKey: true },
    { name: "full_name", type: "text", notNull: true, unique: true },
    { name: "owner", type: "text", notNull: true },
    { name: "name", type: "text", notNull: true },
    { name: "owner_avatar_url", type: "text", notNull: true },
    { name: "description", type: "text" },
    { name: "url", type: "text", notNull: true },
    { name: "homepage", type: "text" },
    { name: "language", type: "text" },
    { name: "topics", type: "jsonb", notNull: true },
    { name: "license", type: "text" },
    { name: "stars", type: "integer", notNull: true },
    { name: "forks", type: "integer", notNull: true },
    { name: "open_issues", type: "integer", notNull: true },
    { name: "contributors", type: "integer", notNull: true },
    { name: "stars_delta_24h", type: "integer", notNull: true },
    { name: "stars_delta_7d", type: "integer", notNull: true },
    { name: "stars_delta_30d", type: "integer", notNull: true },
    { name: "momentum_score", type: "real", notNull: true },
    { name: "movement_status", type: "text", notNull: true },
    { name: "rank", type: "integer", notNull: true },
    { name: "category_id", type: "text", notNull: true },
    { name: "category_rank", type: "integer", notNull: true },
    { name: "sparkline_data", type: "jsonb", notNull: true },
    { name: "mention_count_24h", type: "integer", notNull: true },
    { name: "social_buzz_score", type: "real", notNull: true },
    { name: "last_commit_at", type: "timestamp" },
    { name: "last_release_at", type: "timestamp" },
    { name: "last_release_tag", type: "text" },
    { name: "created_at", type: "timestamp", notNull: true },
    { name: "updated_at", type: "timestamp", notNull: true },
  ],
  indices: [
    { name: "repos_category_idx", columns: ["category_id"] },
    { name: "repos_momentum_idx", columns: ["momentum_score"] },
    { name: "repos_rank_idx", columns: ["rank"] },
  ],
};

/**
 * Point-in-time metric captures. One row per repo per ingestion cadence —
 * the series feeds 24h/7d/30d delta computation. Upstream dedupe keys on
 * `(repo_id, captured_at)`.
 */
export const snapshots: TableDescriptor = {
  name: "snapshots",
  columns: [
    { name: "id", type: "text", primaryKey: true },
    {
      name: "repo_id",
      type: "text",
      notNull: true,
      references: "repos.id",
    },
    { name: "captured_at", type: "timestamp", notNull: true },
    { name: "source", type: "text", notNull: true },
    { name: "stars", type: "integer", notNull: true },
    { name: "forks", type: "integer", notNull: true },
    { name: "open_issues", type: "integer", notNull: true },
    { name: "watchers", type: "integer", notNull: true },
    { name: "contributors", type: "integer", notNull: true },
    { name: "size_kb", type: "integer", notNull: true },
    { name: "last_commit_at", type: "timestamp" },
    { name: "last_release_at", type: "timestamp" },
    { name: "last_release_tag", type: "text" },
    { name: "mention_count_24h", type: "integer", notNull: true },
    { name: "social_buzz_score", type: "real", notNull: true },
  ],
  indices: [
    {
      name: "snapshots_repo_captured_idx",
      columns: ["repo_id", "captured_at"],
    },
  ],
};

/** Latest computed momentum score per repo. One row per repo. */
export const scores: TableDescriptor = {
  name: "scores",
  columns: [
    {
      name: "repo_id",
      type: "text",
      primaryKey: true,
      references: "repos.id",
    },
    { name: "computed_at", type: "timestamp", notNull: true },
    { name: "overall", type: "real", notNull: true },
    { name: "components", type: "jsonb", notNull: true },
    { name: "weights", type: "jsonb", notNull: true },
    { name: "modifiers", type: "jsonb", notNull: true },
    { name: "is_breakout", type: "boolean", notNull: true },
    { name: "is_quiet_killer", type: "boolean", notNull: true },
    { name: "movement_status", type: "text", notNull: true },
    { name: "explanation", type: "text", notNull: true },
  ],
};

/** Category classification — latest primary+secondary per repo. */
export const categories: TableDescriptor = {
  name: "categories",
  columns: [
    {
      name: "repo_id",
      type: "text",
      primaryKey: true,
      references: "repos.id",
    },
    { name: "classified_at", type: "timestamp", notNull: true },
    { name: "primary", type: "jsonb", notNull: true },
    { name: "secondary", type: "jsonb", notNull: true },
  ],
};

/** Latest why-it's-moving bundle per repo. */
export const reasons: TableDescriptor = {
  name: "reasons",
  columns: [
    {
      name: "repo_id",
      type: "text",
      primaryKey: true,
      references: "repos.id",
    },
    { name: "generated_at", type: "timestamp", notNull: true },
    { name: "codes", type: "jsonb", notNull: true },
    { name: "summary", type: "text", notNull: true },
    { name: "details", type: "jsonb", notNull: true },
  ],
};

/** Individual social-signal mentions (HN, Reddit, X, etc.). */
export const mentions: TableDescriptor = {
  name: "mentions",
  columns: [
    { name: "id", type: "text", primaryKey: true },
    {
      name: "repo_id",
      type: "text",
      notNull: true,
      references: "repos.id",
    },
    { name: "platform", type: "text", notNull: true },
    { name: "author", type: "text", notNull: true },
    { name: "author_followers", type: "integer" },
    { name: "content", type: "text", notNull: true },
    { name: "url", type: "text", notNull: true },
    { name: "sentiment", type: "text", notNull: true },
    { name: "engagement", type: "integer", notNull: true },
    { name: "reach", type: "integer", notNull: true },
    { name: "posted_at", type: "timestamp", notNull: true },
    { name: "discovered_at", type: "timestamp", notNull: true },
    { name: "is_influencer", type: "boolean", notNull: true },
  ],
  indices: [
    {
      name: "mentions_repo_posted_idx",
      columns: ["repo_id", "posted_at"],
    },
  ],
};

/** Rolled-up per-repo buzz aggregate. One row per repo. */
export const mentionAggregates: TableDescriptor = {
  name: "mention_aggregates",
  columns: [
    {
      name: "repo_id",
      type: "text",
      primaryKey: true,
      references: "repos.id",
    },
    { name: "computed_at", type: "timestamp", notNull: true },
    { name: "mention_count_24h", type: "integer", notNull: true },
    { name: "mention_count_7d", type: "integer", notNull: true },
    { name: "platform_breakdown", type: "jsonb", notNull: true },
    { name: "sentiment_score", type: "real", notNull: true },
    { name: "influencer_mentions", type: "integer", notNull: true },
    { name: "total_reach", type: "integer", notNull: true },
    { name: "buzz_score", type: "real", notNull: true },
    { name: "buzz_trend", type: "text", notNull: true },
  ],
};

/** Latest Twitter/X signal per repo. */
export const twitterRepoSignals: TableDescriptor = {
  name: "twitter_repo_signals",
  columns: [
    { name: "repo_id", type: "text", primaryKey: true, references: "repos.id" },
    { name: "github_full_name", type: "text", notNull: true },
    { name: "github_url", type: "text", notNull: true },
    { name: "repo_name", type: "text", notNull: true },
    { name: "owner_name", type: "text", notNull: true },
    { name: "latest_scan_id", type: "text", notNull: true, unique: true },
    { name: "latest_scan_status", type: "text", notNull: true },
    { name: "updated_at", type: "timestamp", notNull: true },
    { name: "metrics", type: "jsonb", notNull: true },
    { name: "score", type: "jsonb", notNull: true },
    { name: "badge", type: "jsonb", notNull: true },
    { name: "row_badge", type: "jsonb", notNull: true },
    { name: "top_posts", type: "jsonb", notNull: true },
  ],
  indices: [
    { name: "twitter_repo_signals_score_idx", columns: ["updated_at"] },
    { name: "twitter_repo_signals_full_name_idx", columns: ["github_full_name"] },
  ],
};

/** One OpenClaw Twitter scan per scan id. */
export const twitterScans: TableDescriptor = {
  name: "twitter_scans",
  columns: [
    { name: "scan_id", type: "text", primaryKey: true },
    { name: "version", type: "text", notNull: true },
    { name: "repo_id", type: "text", notNull: true, references: "repos.id" },
    { name: "github_full_name", type: "text", notNull: true },
    { name: "scan_status", type: "text", notNull: true },
    { name: "scan_triggered_by", type: "text", notNull: true },
    { name: "scan_window_hours", type: "integer", notNull: true },
    { name: "started_at", type: "timestamp", notNull: true },
    { name: "completed_at", type: "timestamp", notNull: true },
    { name: "ingested_at", type: "timestamp", notNull: true },
    { name: "metrics", type: "jsonb", notNull: true },
    { name: "score", type: "jsonb", notNull: true },
    { name: "badge", type: "jsonb", notNull: true },
  ],
  indices: [
    { name: "twitter_scans_repo_completed_idx", columns: ["repo_id", "completed_at"] },
  ],
};

/** Query bundle used for a single Twitter scan. */
export const twitterScanQueries: TableDescriptor = {
  name: "twitter_scan_queries",
  columns: [
    { name: "id", type: "text", primaryKey: true },
    { name: "scan_id", type: "text", notNull: true, references: "twitter_scans.scan_id" },
    { name: "repo_id", type: "text", notNull: true, references: "repos.id" },
    { name: "query_text", type: "text", notNull: true },
    { name: "query_type", type: "text", notNull: true },
    { name: "tier", type: "integer", notNull: true },
    { name: "confidence_weight", type: "real", notNull: true },
    { name: "enabled", type: "boolean", notNull: true },
    { name: "rationale", type: "text", notNull: true },
  ],
  indices: [
    { name: "twitter_scan_queries_scan_idx", columns: ["scan_id"] },
    { name: "twitter_scan_queries_repo_idx", columns: ["repo_id"] },
  ],
};

/** Matched Twitter/X posts retained as evidence for review. */
export const twitterScanPosts: TableDescriptor = {
  name: "twitter_scan_posts",
  columns: [
    { name: "id", type: "text", primaryKey: true },
    { name: "scan_id", type: "text", notNull: true, references: "twitter_scans.scan_id" },
    { name: "repo_id", type: "text", notNull: true, references: "repos.id" },
    { name: "post_id", type: "text", notNull: true },
    { name: "post_url", type: "text", notNull: true },
    { name: "canonical_post_id", type: "text" },
    { name: "author_handle", type: "text", notNull: true },
    { name: "author_id", type: "text" },
    { name: "posted_at", type: "timestamp", notNull: true },
    { name: "text", type: "text", notNull: true },
    { name: "likes", type: "integer", notNull: true },
    { name: "reposts", type: "integer", notNull: true },
    { name: "replies", type: "integer", notNull: true },
    { name: "quotes", type: "integer", notNull: true },
    { name: "author_followers", type: "integer" },
    { name: "is_repost", type: "boolean", notNull: true },
    { name: "matched_by", type: "text", notNull: true },
    { name: "confidence", type: "text", notNull: true },
    { name: "matched_terms", type: "jsonb", notNull: true },
    { name: "why_matched", type: "text", notNull: true },
    { name: "supporting_context", type: "jsonb", notNull: true },
    { name: "source_query", type: "text", notNull: true },
    { name: "source_query_type", type: "text", notNull: true },
  ],
  indices: [
    { name: "twitter_scan_posts_scan_idx", columns: ["scan_id"] },
    { name: "twitter_scan_posts_repo_posted_idx", columns: ["repo_id", "posted_at"] },
    { name: "twitter_scan_posts_post_id_idx", columns: ["post_id"] },
  ],
};

/** Append-safe audit log for internal Twitter/X ingestions. */
export const twitterIngestions: TableDescriptor = {
  name: "twitter_ingestions",
  columns: [
    { name: "ingestion_id", type: "text", primaryKey: true },
    { name: "version", type: "text", notNull: true },
    { name: "source", type: "text", notNull: true },
    { name: "scan_id", type: "text", notNull: true, references: "twitter_scans.scan_id", unique: true },
    { name: "repo_id", type: "text", notNull: true, references: "repos.id" },
    { name: "github_full_name", type: "text", notNull: true },
    { name: "authenticated_principal", type: "text", notNull: true },
    { name: "agent_name", type: "text", notNull: true },
    { name: "agent_version", type: "text", notNull: true },
    { name: "agent_run_id", type: "text", notNull: true },
    { name: "payload_hash", type: "text", notNull: true },
    { name: "scan_status", type: "text", notNull: true },
    { name: "summary_promoted", type: "boolean", notNull: true },
    { name: "queries_stored", type: "integer", notNull: true },
    { name: "posts_received", type: "integer", notNull: true },
    { name: "posts_accepted", type: "integer", notNull: true },
    { name: "posts_rejected", type: "integer", notNull: true },
    { name: "posts_inserted", type: "integer", notNull: true },
    { name: "posts_updated", type: "integer", notNull: true },
    { name: "computed", type: "jsonb", notNull: true },
    { name: "created_at", type: "timestamp", notNull: true },
  ],
  indices: [
    { name: "twitter_ingestions_repo_idx", columns: ["repo_id", "created_at"] },
    { name: "twitter_ingestions_scan_idx", columns: ["scan_id"] },
  ],
};

/** User-configured alert rules. */
export const alertRules: TableDescriptor = {
  name: "alert_rules",
  columns: [
    { name: "id", type: "text", primaryKey: true },
    { name: "user_id", type: "text", notNull: true },
    { name: "repo_id", type: "text", references: "repos.id" },
    { name: "category_id", type: "text" },
    { name: "trigger", type: "text", notNull: true },
    { name: "threshold", type: "real", notNull: true },
    { name: "cooldown_minutes", type: "integer", notNull: true },
    { name: "enabled", type: "boolean", notNull: true },
    { name: "created_at", type: "timestamp", notNull: true },
    { name: "last_fired_at", type: "timestamp" },
  ],
  indices: [
    { name: "alert_rules_user_idx", columns: ["user_id"] },
    { name: "alert_rules_enabled_idx", columns: ["enabled"] },
  ],
};

/** Fired alert events — append-only log keyed by event id. */
export const alertEvents: TableDescriptor = {
  name: "alert_events",
  columns: [
    { name: "id", type: "text", primaryKey: true },
    {
      name: "rule_id",
      type: "text",
      notNull: true,
      references: "alert_rules.id",
    },
    { name: "repo_id", type: "text", notNull: true, references: "repos.id" },
    { name: "user_id", type: "text", notNull: true },
    { name: "trigger", type: "text", notNull: true },
    { name: "title", type: "text", notNull: true },
    { name: "body", type: "text", notNull: true },
    { name: "url", type: "text", notNull: true },
    { name: "fired_at", type: "timestamp", notNull: true },
    { name: "read_at", type: "timestamp" },
    { name: "condition_value", type: "real", notNull: true },
    { name: "threshold", type: "real", notNull: true },
  ],
  indices: [
    { name: "alert_events_user_fired_idx", columns: ["user_id", "fired_at"] },
    { name: "alert_events_rule_idx", columns: ["rule_id"] },
  ],
};

/** Placeholder for eventual user accounts (auth via Supabase / Clerk / etc). */
export const users: TableDescriptor = {
  name: "users",
  columns: [
    { name: "id", type: "text", primaryKey: true },
    { name: "email", type: "text", notNull: true, unique: true },
    { name: "display_name", type: "text" },
    { name: "created_at", type: "timestamp", notNull: true },
    {
      name: "last_active_at",
      type: "timestamp",
      notNull: true,
      defaultSql: "now()",
    },
  ],
};

/** Cross-device watchlist — per-user set of watched repos. */
export const watchlist: TableDescriptor = {
  name: "watchlist",
  columns: [
    { name: "user_id", type: "text", notNull: true, references: "users.id" },
    { name: "repo_id", type: "text", notNull: true, references: "repos.id" },
    { name: "added_at", type: "timestamp", notNull: true, defaultSql: "now()" },
    { name: "note", type: "text" },
  ],
  indices: [
    { name: "watchlist_user_idx", columns: ["user_id"] },
    {
      name: "watchlist_user_repo_uniq",
      columns: ["user_id", "repo_id"],
      unique: true,
    },
  ],
};

// ---------------------------------------------------------------------------
// Schema manifest — used by the migration codegen.
// ---------------------------------------------------------------------------

/**
 * Ordered list of every table in the schema. Order matters for codegen
 * (parent tables before their children) and for the one-shot JSONL-to-SQL
 * migration script documented in `docs/DATABASE.md`.
 */
/** Funding signals — raw + extracted startup funding rounds. */
export const fundingRounds: TableDescriptor = {
  name: "funding_rounds",
  columns: [
    { name: "id", type: "text", primaryKey: true },
    { name: "company_name", type: "text", notNull: true },
    { name: "company_website", type: "text" },
    { name: "company_logo_url", type: "text" },
    { name: "amount", type: "bigint" },
    { name: "amount_display", type: "text", notNull: true },
    { name: "currency", type: "text", notNull: true },
    { name: "round_type", type: "text", notNull: true },
    { name: "investors", type: "jsonb", notNull: true },
    { name: "description", type: "text", notNull: true },
    { name: "tags", type: "jsonb", notNull: true },
    { name: "source_url", type: "text", notNull: true },
    { name: "source_platform", type: "text", notNull: true },
    { name: "announced_at", type: "timestamp", notNull: true },
    { name: "discovered_at", type: "timestamp", notNull: true },
    { name: "confidence", type: "text", notNull: true },
    { name: "reviewed", type: "boolean", notNull: true },
    // Repo-matching columns — populated by the funding matcher (see
    // src/lib/funding/match.ts + src/lib/funding/repo-events.ts). BOTH nullable,
    // so backfilling is additive and safe. A DBA must generate a drizzle/db
    // migration from this descriptor — the file-persistence layer is JSONL so
    // this declaration is intent-only until the Postgres cutover.
    //
    // Migration SQL (append to next migration):
    //   ALTER TABLE funding_rounds
    //     ADD COLUMN repo_id          TEXT NULL,
    //     ADD COLUMN match_confidence REAL NULL,
    //     ADD COLUMN match_reason     TEXT NULL,
    //     ADD COLUMN matched_at       TIMESTAMP NULL;
    //   CREATE INDEX funding_rounds_repo_idx ON funding_rounds(repo_id);
    { name: "repo_id", type: "text" },
    { name: "match_confidence", type: "real" },
    { name: "match_reason", type: "text" },
    { name: "matched_at", type: "timestamp" },
  ],
  indices: [
    { name: "funding_rounds_announced_idx", columns: ["announced_at"] },
    { name: "funding_rounds_platform_idx", columns: ["source_platform"] },
    { name: "funding_rounds_type_idx", columns: ["round_type"] },
    { name: "funding_rounds_repo_idx", columns: ["repo_id"] },
  ],
};

/**
 * Builder reactions on a target object (repo today, idea later).
 *
 * One row per (user, object, type). The intake layer enforces that a user
 * can only have a single active reaction of each type on each target — so
 * "user A toggles 'build' on repo X" is a single row that gets inserted on
 * first toggle and deleted on second. Counts are derived by aggregating.
 *
 * Reaction types ("build", "use", "buy", "invest") are constrained at the
 * application layer rather than via SQL CHECK so we can add new types
 * without a migration.
 */
export const reactions: TableDescriptor = {
  name: "reactions",
  columns: [
    { name: "id", type: "text", primaryKey: true },
    { name: "user_id", type: "text", notNull: true, references: "users.id" },
    // object_type narrows the FK target — "repo" today; "idea" once the
    // ideas table lands. Stored as text so we don't need a polymorphic FK.
    { name: "object_type", type: "text", notNull: true },
    { name: "object_id", type: "text", notNull: true },
    { name: "reaction_type", type: "text", notNull: true },
    { name: "created_at", type: "timestamp", notNull: true },
  ],
  indices: [
    // The hot path is "give me counts for object_id" — and per-user "did I
    // already react." The composite uniqueness is the toggle invariant.
    { name: "reactions_object_idx", columns: ["object_type", "object_id"] },
    { name: "reactions_user_idx", columns: ["user_id"] },
    {
      name: "reactions_user_target_uniq",
      columns: ["user_id", "object_type", "object_id", "reaction_type"],
      unique: true,
    },
  ],
};

/** Hackathon and accelerator events. */
export const hackathonEvents: TableDescriptor = {
  name: "hackathon_events",
  columns: [
    { name: "id", type: "text", primaryKey: true },
    { name: "name", type: "text", notNull: true },
    { name: "organizer", type: "text", notNull: true },
    { name: "description", type: "text", notNull: true },
    { name: "website", type: "text", notNull: true },
    { name: "prizes_display", type: "text" },
    { name: "start_date", type: "timestamp", notNull: true },
    { name: "end_date", type: "timestamp", notNull: true },
    { name: "deadline_date", type: "timestamp" },
    { name: "location", type: "text", notNull: true },
    { name: "city", type: "text" },
    { name: "country", type: "text" },
    { name: "tags", type: "jsonb", notNull: true },
    { name: "source_platform", type: "text", notNull: true },
    { name: "source_url", type: "text", notNull: true },
    { name: "discovered_at", type: "timestamp", notNull: true },
  ],
  indices: [
    { name: "hackathon_events_start_idx", columns: ["start_date"] },
    { name: "hackathon_events_deadline_idx", columns: ["deadline_date"] },
  ],
};

export const schema: TableDescriptor[] = [
  repos,
  snapshots,
  scores,
  categories,
  reasons,
  mentions,
  mentionAggregates,
  twitterRepoSignals,
  twitterScans,
  twitterScanQueries,
  twitterScanPosts,
  twitterIngestions,
  fundingRounds,
  hackathonEvents,
  users,
  alertRules,
  alertEvents,
  watchlist,
  reactions,
];
