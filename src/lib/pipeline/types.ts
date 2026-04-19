// StarScreener Pipeline — all data-layer entity types
//
// The pipeline extends the public types in ../types.ts with the entities
// needed for ingestion, snapshotting, scoring breakdowns, classification,
// reasons, alerts, and digests. Everything here is the contract shared
// between adapters, engines, storage, and query services.

import type { Repo, SocialPlatform, Sentiment, MovementStatus } from "../types";

// ---------------------------------------------------------------------------
// INGESTION — GitHub + social adapter outputs
// ---------------------------------------------------------------------------

/** Raw data shape from the GitHub REST API (subset we consume). */
export interface GitHubRepoRaw {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string; avatar_url: string };
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  topics: string[];
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  watchers_count: number;
  subscribers_count?: number;
  size: number;
  default_branch: string;
  license: { spdx_id: string | null; key: string; name: string } | null;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  archived: boolean;
  disabled: boolean;
}

/** Release metadata from GitHub. */
export interface GitHubReleaseRaw {
  tag_name: string;
  name: string | null;
  published_at: string;
  html_url: string;
  prerelease: boolean;
  draft: boolean;
}

/** Normalized outcome of a single ingestion pass. */
export interface IngestResult {
  repoId: string;
  ok: boolean;
  source: "github" | "mock";
  fetchedAt: string;
  rateLimitRemaining: number | null;
  rateLimitReset: string | null;
  error: string | null;
  /** The normalized Repo shape we persist (null on error). */
  repo: Repo | null;
  /** Latest release info if fetched. */
  latestRelease: GitHubReleaseRaw | null;
}

/** Aggregate result of a batch ingestion. */
export interface IngestBatchResult {
  startedAt: string;
  finishedAt: string;
  total: number;
  ok: number;
  failed: number;
  rateLimitRemaining: number | null;
  results: IngestResult[];
}

// ---------------------------------------------------------------------------
// SNAPSHOT STORAGE — point-in-time metric captures
// ---------------------------------------------------------------------------

/** Point-in-time metrics for a repo. One per capture interval. */
export interface RepoSnapshot {
  id: string;                    // `${repoId}:${capturedAt}:${source}`
  repoId: string;
  capturedAt: string;            // ISO 8601
  source: "github" | "mock";

  stars: number;
  forks: number;
  openIssues: number;
  watchers: number;
  contributors: number;
  sizeKb: number;

  lastCommitAt: string | null;
  lastReleaseAt: string | null;
  lastReleaseTag: string | null;

  /** Present if we computed social signals at this snapshot. */
  mentionCount24h: number;
  socialBuzzScore: number;       // 0-100
}

/** Pre-computed delta between two snapshots for a window. */
export interface SnapshotDelta {
  repoId: string;
  window: "24h" | "7d" | "30d";
  fromAt: string;                // ISO of earlier snapshot
  toAt: string;                  // ISO of later snapshot

  starsDelta: number;
  starsPercent: number;          // % change vs prior
  forksDelta: number;
  forksPercent: number;
  contributorsDelta: number;
  issuesDelta: number;
  watchersDelta: number;

  /** Optional release/commit freshness change signals */
  releaseShippedInWindow: boolean;
  commitsInWindow: number;       // approximate (derived from snapshot cadence)
}

// ---------------------------------------------------------------------------
// SCORING — modular composite with full breakdown
// ---------------------------------------------------------------------------

/** Weights for the composite momentum score. Must sum to ~1.0. */
export interface ScoreWeights {
  starVelocity24h: number;
  starVelocity7d: number;
  forkVelocity7d: number;
  contributorGrowth30d: number;
  commitFreshness: number;
  releaseFreshness: number;
  socialBuzz: number;
  issueActivity: number;
  communityHealth: number;
  categoryMomentum: number;
}

/** Each component normalized to 0-100 before weighting. */
export interface ScoreComponents {
  starVelocity24h: number;
  starVelocity7d: number;
  forkVelocity7d: number;
  contributorGrowth30d: number;
  commitFreshness: number;
  releaseFreshness: number;
  socialBuzz: number;
  issueActivity: number;
  communityHealth: number;
  categoryMomentum: number;
}

/** Multipliers and bonuses applied after the weighted sum. */
export interface ScoreModifiers {
  decayFactor: number;           // 0.3-1.0 — stale repos get lower
  antiSpamDampening: number;     // 0.3-1.0 — low fork:star + no social = dampen
  breakoutMultiplier: number;    // 1.0-1.5 — <1k stars + 3x acceleration
  quietKillerBonus: number;      // 0-10 points added after multiplication
}

/** Full scoring output — persistable, inspectable. */
export interface RepoScore {
  repoId: string;
  computedAt: string;
  overall: number;               // 0-100
  components: ScoreComponents;
  weights: ScoreWeights;
  modifiers: ScoreModifiers;
  isBreakout: boolean;
  isQuietKiller: boolean;
  movementStatus: MovementStatus;
  /** Human-readable explanation of the score. */
  explanation: string;
}

// ---------------------------------------------------------------------------
// CLASSIFICATION — category assignment with confidence
// ---------------------------------------------------------------------------

export type PipelineCategoryId =
  | "ai-agents"
  | "mcp"
  | "devtools"
  | "browser-automation"
  | "local-llm"
  | "security"
  | "infrastructure"
  | "design-engineering"
  // extended categories (matches existing mock-data surface)
  | "ai-ml"
  | "web-frameworks"
  | "databases"
  | "mobile"
  | "data-analytics"
  | "crypto-web3"
  | "rust-ecosystem";

export interface ClassificationRule {
  categoryId: PipelineCategoryId;
  /** Exact topic matches (highest signal). */
  topics: string[];
  /** Keywords to match in name or description (lowercased). */
  keywords: string[];
  /** Owner/org prefixes that strongly imply this category. */
  ownerPrefixes: string[];
  /** Weight applied when this rule matches. */
  weight: number;
}

export interface ClassificationMatch {
  categoryId: PipelineCategoryId;
  confidence: number;            // 0-1
  /** Which signals matched. */
  matched: {
    topics: string[];
    keywords: string[];
    ownerPrefix: string | null;
  };
}

export interface RepoCategory {
  repoId: string;
  classifiedAt: string;
  primary: ClassificationMatch;
  secondary: ClassificationMatch[];
}

// ---------------------------------------------------------------------------
// REASONS — structured "why it's moving"
// ---------------------------------------------------------------------------

export type ReasonCode =
  | "release_recent"             // new release in last 7 days
  | "release_major"              // major version bump
  | "star_velocity_up"           // 24h rate significantly above 7d rate
  | "star_spike"                 // >5% stars in 24h
  | "fork_velocity_up"           // fork growth accelerating
  | "contributor_growth"         // new contributors joining
  | "commit_fresh"               // commit in last 24h
  | "rank_jump"                  // rank improved >5 places
  | "category_top"               // became top mover in category
  | "hacker_news_front_page"     // HN front page signal
  | "viral_social_post"          // single high-reach mention
  | "social_buzz_elevated"       // social buzz score > 60
  | "issue_activity_spike"       // unusual issue velocity
  | "breakout_detected"          // breakout classifier fired
  | "quiet_killer_detected"      // steady sustained growth
  | "organic_growth";            // no single cause

export interface ReasonDetail {
  code: ReasonCode;
  headline: string;              // "Shipped v2.0 six hours ago"
  detail: string;                // longer sentence
  confidence: "high" | "medium" | "low";
  timeframe: string;             // "6h ago", "2d ago"
  evidence: { label: string; value: string | number }[];
}

export interface RepoReason {
  repoId: string;
  generatedAt: string;
  codes: ReasonCode[];
  summary: string;               // single short natural language sentence
  details: ReasonDetail[];
}

// ---------------------------------------------------------------------------
// SOCIAL SIGNALS — mentions + aggregate
// ---------------------------------------------------------------------------

export interface RepoMention {
  id: string;
  repoId: string;
  platform: SocialPlatform;
  author: string;
  authorFollowers: number | null;
  content: string;
  url: string;
  sentiment: Sentiment;
  engagement: number;            // platform-native (likes+comments+shares)
  reach: number;                 // estimated impressions
  postedAt: string;
  discoveredAt: string;
  isInfluencer: boolean;
}

/** Aggregated social signal for a single repo. */
export interface SocialAggregate {
  repoId: string;
  computedAt: string;
  mentionCount24h: number;
  mentionCount7d: number;
  platformBreakdown: Partial<Record<SocialPlatform, number>>;
  sentimentScore: number;        // -1 to +1
  influencerMentions: number;
  totalReach: number;
  buzzScore: number;             // 0-100 — fed into RepoScore.components.socialBuzz
  buzzTrend: "spiking" | "rising" | "steady" | "fading" | "quiet";
}

// ---------------------------------------------------------------------------
// WATCHLIST + ALERTS
// ---------------------------------------------------------------------------

export type AlertTriggerType =
  | "star_spike"                 // stars gained > threshold in 24h
  | "new_release"                // new release tag published
  | "rank_jump"                  // rank improved by > threshold places
  | "discussion_spike"           // mentions > threshold in 24h
  | "momentum_threshold"         // momentum crosses threshold up or down
  | "breakout_detected"          // repo classified as breakout
  | "daily_digest"               // scheduled daily summary
  | "weekly_digest";             // scheduled weekly summary

export interface AlertRule {
  id: string;
  userId: string;                // "local" for unauthenticated MVP
  repoId: string | null;         // null = applies globally
  categoryId: PipelineCategoryId | null;
  trigger: AlertTriggerType;
  threshold: number;             // interpretation depends on trigger type
  cooldownMinutes: number;
  enabled: boolean;
  createdAt: string;
  lastFiredAt: string | null;
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  repoId: string;
  userId: string;
  trigger: AlertTriggerType;
  title: string;
  body: string;
  url: string;
  firedAt: string;
  readAt: string | null;
  /** The evaluated condition value that caused the fire. */
  conditionValue: number;
  threshold: number;
}

/** An item in a daily/weekly digest. */
export interface DigestItem {
  repoId: string;
  position: number;
  headline: string;
  metric: string;                // e.g. "+2,400 stars in 24h"
  reason: string;                // short why-it's-moving summary
}

export interface Digest {
  id: string;
  userId: string;
  period: "daily" | "weekly";
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  items: DigestItem[];
}

// ---------------------------------------------------------------------------
// INGESTION SCHEDULING — hot/warm/cold tiers
// ---------------------------------------------------------------------------

export type RefreshTier = "hot" | "warm" | "cold";

export interface RefreshPolicy {
  tier: RefreshTier;
  intervalMinutes: number;       // cadence
  maxPerHour: number;            // rate cap
}

export interface RefreshPlan {
  repoId: string;
  tier: RefreshTier;
  lastRefreshedAt: string | null;
  nextRefreshAt: string;
  priority: number;              // 0-100; higher = sooner
  reasons: string[];             // why this tier (e.g., "watchlisted", "top mover")
}

// ---------------------------------------------------------------------------
// QUERY LAYER — service responses
// ---------------------------------------------------------------------------

export type TrendWindow = "today" | "week" | "month";
export type TrendFilter = "all" | "breakouts" | "quiet-killers" | "hot" | "new-under-30d" | "under-1k-stars";

export interface RepoSummary {
  repo: Repo;
  score: RepoScore;
  category: RepoCategory | null;
  reasons: RepoReason | null;
  social: SocialAggregate | null;
  lastSnapshotAt: string;
}

export interface CompareRepoMetrics {
  repo: Repo;
  score: RepoScore;
  starHistory: number[];
  forkHistory: number[];
  reasons: ReasonCode[];
}

export interface CompareResult {
  repos: CompareRepoMetrics[];
  winners: {
    momentum: string;
    stars: string;
    growth7d: string;
    contributors: string;
    freshness: string;
  };
}

// ---------------------------------------------------------------------------
// ADAPTER INTERFACES — swappable data sources
// ---------------------------------------------------------------------------

export interface GitHubAdapter {
  readonly id: "github" | "mock-github";
  fetchRepo(fullName: string): Promise<GitHubRepoRaw | null>;
  fetchLatestRelease(fullName: string): Promise<GitHubReleaseRaw | null>;
  fetchContributorCount(fullName: string): Promise<number>;
  getRateLimit(): Promise<{ remaining: number; reset: string } | null>;
}

export interface SocialAdapter {
  readonly id: string;
  readonly platform: SocialPlatform;
  fetchMentionsForRepo(fullName: string, since?: string): Promise<RepoMention[]>;
}

// ---------------------------------------------------------------------------
// STORAGE INTERFACES
// ---------------------------------------------------------------------------

export interface RepoStore {
  upsert(repo: Repo): void;
  get(repoId: string): Repo | undefined;
  /** Returns every record, including tombstoned ones (deleted/archived). */
  getAll(): Repo[];
  /** Excludes records flagged `deleted: true`. Prefer this for user-facing queries. */
  getActive(): Repo[];
  getByFullName(fullName: string): Repo | undefined;
}

export interface SnapshotStore {
  append(snapshot: RepoSnapshot): void;
  list(repoId: string, limit?: number): RepoSnapshot[];           // newest first
  getAt(repoId: string, atOrBefore: string): RepoSnapshot | undefined;
  getLatest(repoId: string): RepoSnapshot | undefined;
  clear(repoId?: string): void;
  /** Total snapshots across every repo, maintained in O(1). */
  totalCount(): number;
}

export interface ScoreStore {
  save(score: RepoScore): void;
  get(repoId: string): RepoScore | undefined;
  getAll(): RepoScore[];
}

export interface CategoryStore {
  save(classification: RepoCategory): void;
  get(repoId: string): RepoCategory | undefined;
  getAll(): RepoCategory[];
}

export interface ReasonStore {
  save(reasons: RepoReason): void;
  get(repoId: string): RepoReason | undefined;
}

export interface MentionStore {
  append(mention: RepoMention): void;
  listForRepo(repoId: string, limit?: number): RepoMention[];
  aggregateForRepo(repoId: string): SocialAggregate | undefined;
  saveAggregate(agg: SocialAggregate): void;
}

export interface AlertRuleStore {
  save(rule: AlertRule): AlertRule;
  remove(id: string): boolean;
  listForUser(userId: string): AlertRule[];
  listAll(): AlertRule[];
}

export interface AlertEventStore {
  append(event: AlertEvent): void;
  listForUser(userId: string, unreadOnly?: boolean): AlertEvent[];
  markRead(id: string): void;
}
