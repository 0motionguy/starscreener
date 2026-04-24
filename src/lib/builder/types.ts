// TrendingRepo — Builder layer types.
//
// The "builder layer" is the P0 social/decision stack on top of the existing
// signal platform: Ideas, Reactions, Predictions, Sprints, and the lightweight
// cookie-bound Builder identity. This file is the single source of truth for
// the types shared between the JSON store, API routes, UI, and Portal tools.
//
// Storage today: atomic JSON files under data/builder/*.json via
// src/lib/builder/store.ts. Migration path to Postgres lives in
// src/lib/db/schema.ts (tables: ideas, reactions, predictions, sprints,
// builders). Keep shapes aligned.

export type ReactionKind = "use" | "build" | "buy" | "invest";

export type IdeaPhase = "seed" | "alpha" | "beta" | "live" | "sunset";

export type PredictionArchetype =
  | "star_trajectory"
  | "crossover"
  | "ship_release"
  | "adoption";

export type PredictionSubjectType = "repo" | "pair" | "idea";

export type PredictionMethod =
  | "auto_linear_vol_30d"
  | "auto_linear_vol_90d"
  | "builder_poll"
  | "hybrid";

/**
 * A Builder is a cookie-bound identity until upgraded via GitHub OAuth in P1.
 * The client mints a random `id` on first visit, stored as an httpOnly cookie
 * by the server (see src/lib/builder/identity.ts). Once OAuth lands, `id`
 * stays stable and `githubLogin` is filled in.
 */
export interface Builder {
  id: string;
  /** Display handle — defaults to "builder-<first-6-of-id>". */
  handle: string;
  /** Filled in after GitHub OAuth upgrade. */
  githubLogin?: string;
  /** 0..1 — heuristic depth score; rises with non-empty reaction payloads, ideas shipped, accuracy. */
  depthScore: number;
  createdAt: string; // ISO
  lastActiveAt: string; // ISO
}

/** Optional payload fields by reaction kind. All optional; empty payloads count half-weight. */
export interface ReactionPayload {
  /** use: "what for?" — free text ≤80 chars */
  useCase?: string;
  /** build: one-liner thesis ≤140 chars */
  buildThesis?: string;
  /** buy: optional USD price */
  priceUsd?: number;
  /** invest: optional USD amount */
  amountUsd?: number;
  /** invest: optional horizon in years */
  horizonYears?: number;
}

export interface Reaction {
  id: string; // `rxn_<nanoish>`
  kind: ReactionKind;
  /** Target object. Either a repo (owner/name) or an idea (slug). */
  subjectType: "repo" | "idea";
  subjectId: string; // repo fullName or idea slug
  builderId: string;
  payload: ReactionPayload;
  /** When true, this is an invest reaction the builder elected to make public. Default false. */
  publicInvest?: boolean;
  createdAt: string; // ISO
}

/** Aggregated reaction tally for a subject. Cheap to recompute. */
export interface ReactionTally {
  subjectType: "repo" | "idea";
  subjectId: string;
  use: number;
  build: number;
  buy: number;
  invest: number;
  /** (build + 2*invest) / max(uniqueBuilders, 1) — the ranked density. */
  conviction: number;
  uniqueBuilders: number;
  /** Up to 3 top payloads per kind, newest first. Empty array if none. */
  topPayloads: Record<ReactionKind, Array<{ builderId: string; text: string; createdAt: string }>>;
  updatedAt: string;
}

/** Stack tag families — what an Idea is built from. */
export interface IdeaStack {
  models: string[]; // "gpt-5", "claude-opus-4-7", ...
  apis: string[]; // "stripe", "twilio", ...
  tools: string[]; // "next.js", "drizzle", ...
  skills: string[]; // "auth", "payments", ...
}

/** An Idea is a thesis + linked repos + stack. Anchors are required. */
export interface Idea {
  id: string; // `idea_<slug>` for deterministic lookup
  slug: string; // URL-safe, unique
  authorBuilderId: string;
  thesis: string; // 140..500
  problem: string; // 140..500
  whyNow: string; // 140..400 — must cite current signal
  linkedRepoIds: string[]; // 1..8; repo.id (slug form)
  stack: IdeaStack;
  tags: string[];
  phase: IdeaPhase;
  /** If set, points to the active Sprint for this idea. */
  currentSprintId?: string;
  /** Public on the feed? Default true; false keeps it in draft even after submit. */
  public: boolean;
  /** Optional sketch of what an MCP tool exposure would look like. */
  agentReadiness?: Array<{
    toolName: string;
    inputSketch: string;
    outputShape: string;
  }>;
  /** Optional X cross-post state — set after outbound publish. */
  xPostId?: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface Sprint {
  id: string; // `sprint_<nanoish>`
  ideaId: string;
  phase: IdeaPhase;
  startsAt: string; // ISO
  endsAt: string; // ISO
  commitments: Array<{ title: string; owner?: string; status: "planned" | "doing" | "done" }>;
  /** Filled by GH Actions when the idea has a linked public repo. */
  actualCommits: number;
  highlights: Array<{ text: string; createdAt: string }>;
  outcome?: string; // post-sprint retro, written after endsAt
  nextSprintId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A prediction is a probabilistic claim about a future measurable outcome on
 * a repo, a repo pair, or an idea. Must have an automatic resolver — see
 * src/lib/builder/predictions.ts for the rolling-linear engine.
 */
export interface Prediction {
  id: string;
  subjectType: PredictionSubjectType;
  subjectId: string; // repo fullName, "<a>|<b>" for pair, or idea slug
  archetype: PredictionArchetype;
  question: string; // human-readable; e.g. "Will X reach 50k stars by Jun 30?"
  method: PredictionMethod;
  horizonDays: number;
  /** Point forecasts (20/50/80 percentiles of the predicted distribution). */
  p20: number;
  p50: number;
  p80: number;
  /** The underlying quantity being forecast — "stars", "contributors", "mentions_30d", "ship". */
  metric: string;
  unit: string; // "stars", "contributors", "bool", ...
  openedAt: string; // ISO
  resolvesAt: string; // ISO — when the automatic resolver should fire
  /** Populated when the resolver has run. */
  outcome?: {
    actual: number;
    resolvedAt: string;
    /** |actual - p50| / (p80 - p20) — unitless calibration error; lower is better. */
    calibrationDelta: number;
    /** true when actual fell inside [p20, p80]. */
    insideBand: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Aggregates & DTOs for UI / API / Portal
// ---------------------------------------------------------------------------

/** Feed card DTO — what /ideas and /api/ideas returns. Trimmed for payload size. */
export interface IdeaFeedCard {
  id: string;
  slug: string;
  thesis: string;
  whyNow: string;
  tags: string[];
  stack: IdeaStack;
  phase: IdeaPhase;
  authorHandle: string;
  authorDepth: number;
  linkedRepoIds: string[];
  tally: Pick<ReactionTally, "use" | "build" | "buy" | "invest" | "conviction" | "uniqueBuilders">;
  sprintEndsInMs?: number;
  commitsThisSprint?: number;
  createdAt: string;
}

export type IdeaFeedSort = "hot" | "new" | "resolving";

export interface IdeaFeedQuery {
  sort: IdeaFeedSort;
  tag?: string;
  phase?: IdeaPhase;
  limit: number;
  offset: number;
}
