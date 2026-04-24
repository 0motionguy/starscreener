// TrendingRepo — Builder-layer agent tools.
//
// Four tools:
//   - top_ideas                  list the idea feed with sort/tag/phase
//   - idea                       fetch one idea by slug (includes tally + sprints)
//   - reactions_for              aggregated tally + top payloads
//   - predictions_for_repo       active 30d star-trajectory prediction
//
// All four are read-only; write tools will ship once API-key auth lands in
// P1. Every tool returns JSON that matches the DTO exported by
// src/lib/builder/types.ts so MCP clients can share the types.

import { ParamError, NotFoundError } from "./errors";
import { getBuilderStore } from "../lib/builder/store";
import { buildStarTrajectoryPrediction } from "../lib/builder/predictions";
import { getDerivedRepos } from "../lib/derived-repos";
import type {
  IdeaFeedCard,
  IdeaFeedSort,
  ReactionTally,
} from "../lib/builder/types";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const VALID_SORTS: readonly IdeaFeedSort[] = ["hot", "new", "resolving"];
const VALID_PHASES = ["seed", "alpha", "beta", "live", "sunset"] as const;

// ---------------------------------------------------------------------------
// top_ideas
// ---------------------------------------------------------------------------

export interface TopIdeasParams {
  sort?: IdeaFeedSort;
  tag?: string;
  phase?: (typeof VALID_PHASES)[number];
  limit?: number;
}

export interface TopIdeasResult {
  sort: IdeaFeedSort;
  count: number;
  ideas: IdeaFeedCard[];
}

function parseTopIdeasParams(raw: unknown): TopIdeasParams {
  if (raw === null || typeof raw !== "object") {
    throw new ParamError("params must be an object");
  }
  const r = raw as Record<string, unknown>;
  const out: TopIdeasParams = {};
  if (r.sort !== undefined) {
    if (typeof r.sort !== "string" || !VALID_SORTS.includes(r.sort as IdeaFeedSort)) {
      throw new ParamError("sort must be one of 'hot' | 'new' | 'resolving'");
    }
    out.sort = r.sort as IdeaFeedSort;
  }
  if (r.tag !== undefined) {
    if (typeof r.tag !== "string" || r.tag.trim().length === 0) {
      throw new ParamError("tag must be a non-empty string");
    }
    out.tag = r.tag.trim();
  }
  if (r.phase !== undefined) {
    if (
      typeof r.phase !== "string" ||
      !VALID_PHASES.includes(r.phase as (typeof VALID_PHASES)[number])
    ) {
      throw new ParamError(
        "phase must be one of 'seed' | 'alpha' | 'beta' | 'live' | 'sunset'",
      );
    }
    out.phase = r.phase as (typeof VALID_PHASES)[number];
  }
  if (r.limit !== undefined) {
    if (typeof r.limit !== "number" || !Number.isFinite(r.limit) || r.limit < 1) {
      throw new ParamError("limit must be a positive integer");
    }
    out.limit = Math.min(Math.floor(r.limit), MAX_LIMIT);
  }
  return out;
}

export async function topIdeas(raw: unknown): Promise<TopIdeasResult> {
  const params = parseTopIdeasParams(raw);
  const sort = params.sort ?? "new";
  const limit = params.limit ?? DEFAULT_LIMIT;

  const store = getBuilderStore();
  const ideas = await store.listIdeas({
    sort,
    tag: params.tag,
    phase: params.phase,
    limit,
    offset: 0,
  });
  return { sort, count: ideas.length, ideas };
}

export const TOP_IDEAS_PORTAL_PARAMS = {
  sort: {
    type: "string",
    required: false,
    description: "One of 'hot' | 'new' | 'resolving'. Defaults to 'new'.",
  },
  tag: {
    type: "string",
    required: false,
    description: "Exact tag match. Tags are stored lowercase.",
  },
  phase: {
    type: "string",
    required: false,
    description: "Filter by idea phase: seed | alpha | beta | live | sunset.",
  },
  limit: {
    type: "number",
    required: false,
    description: `Max ideas to return. Default ${DEFAULT_LIMIT}, clamped to ${MAX_LIMIT}.`,
  },
} as const;

export const TOP_IDEAS_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    sort: { type: "string", enum: ["hot", "new", "resolving"] },
    tag: { type: "string", minLength: 1 },
    phase: { type: "string", enum: ["seed", "alpha", "beta", "live", "sunset"] },
    limit: { type: "integer", minimum: 1, maximum: MAX_LIMIT },
  },
} as const;

export const TOP_IDEAS_DESCRIPTION =
  "Return the TrendingRepo idea feed. Each idea links 1–8 anchor repos, a thesis, a why-now signal citation, a stack, and conviction reactions. Sort 'hot' ranks by conviction density + freshness; 'new' is reverse-chronological; 'resolving' surfaces ideas whose current sprint ends within 48h.";

// ---------------------------------------------------------------------------
// idea — single idea by slug
// ---------------------------------------------------------------------------

export interface IdeaParams {
  slug: string;
}

function parseIdeaParams(raw: unknown): IdeaParams {
  if (raw === null || typeof raw !== "object") {
    throw new ParamError("params must be an object");
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.slug !== "string" || r.slug.trim().length === 0) {
    throw new ParamError("slug is required and must be a non-empty string");
  }
  return { slug: r.slug.trim() };
}

export async function idea(raw: unknown): Promise<unknown> {
  const { slug } = parseIdeaParams(raw);
  const store = getBuilderStore();
  const found = await store.getIdea(slug);
  if (!found) throw new NotFoundError(`idea not found: ${slug}`);

  const [tally, sprints, author] = await Promise.all([
    store.getTally("idea", found.slug),
    store.sprintsByIdea(found.id),
    store.getBuilder(found.authorBuilderId),
  ]);

  return {
    idea: found,
    author: author
      ? {
          id: author.id,
          handle: author.handle,
          depthScore: author.depthScore,
          githubLogin: author.githubLogin ?? null,
        }
      : null,
    tally,
    sprints,
    _links: {
      self: `/ideas/${found.slug}`,
      mcp_resource: `mcp://trendingrepo/idea/${found.slug}`,
    },
  };
}

export const IDEA_PORTAL_PARAMS = {
  slug: {
    type: "string",
    required: true,
    description: "URL-safe slug of the idea, e.g. 'drop-in-agent-debugger-for-langgraph'.",
  },
} as const;

export const IDEA_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["slug"],
  properties: {
    slug: { type: "string", minLength: 1 },
  },
} as const;

export const IDEA_DESCRIPTION =
  "Fetch a single idea by slug. Returns the idea object (thesis, anchors, stack, why-now), the author snapshot, the aggregated reaction tally with top payloads, and all sprints.";

// ---------------------------------------------------------------------------
// reactions_for
// ---------------------------------------------------------------------------

export interface ReactionsForParams {
  subjectType: "repo" | "idea";
  subjectId: string;
}

function parseReactionsForParams(raw: unknown): ReactionsForParams {
  if (raw === null || typeof raw !== "object") {
    throw new ParamError("params must be an object");
  }
  const r = raw as Record<string, unknown>;
  if (r.subjectType !== "repo" && r.subjectType !== "idea") {
    throw new ParamError("subjectType must be 'repo' or 'idea'");
  }
  if (typeof r.subjectId !== "string" || r.subjectId.trim().length === 0) {
    throw new ParamError("subjectId is required and must be a non-empty string");
  }
  return { subjectType: r.subjectType, subjectId: r.subjectId.trim() };
}

export async function reactionsFor(raw: unknown): Promise<ReactionTally> {
  const params = parseReactionsForParams(raw);
  const store = getBuilderStore();
  return store.getTally(params.subjectType, params.subjectId);
}

export const REACTIONS_FOR_PORTAL_PARAMS = {
  subjectType: {
    type: "string",
    required: true,
    description: "'repo' (use fullName like 'vercel/next.js') or 'idea' (use slug).",
  },
  subjectId: {
    type: "string",
    required: true,
    description: "Repo fullName or idea slug.",
  },
} as const;

export const REACTIONS_FOR_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subjectType", "subjectId"],
  properties: {
    subjectType: { type: "string", enum: ["repo", "idea"] },
    subjectId: { type: "string", minLength: 1 },
  },
} as const;

export const REACTIONS_FOR_DESCRIPTION =
  "Aggregated conviction tally for a repo or idea. Returns counts for use/build/buy/invest, unique builder count, a conviction density score ((build + 2*invest) / uniqueBuilders), and the top 3 public payloads per kind.";

// ---------------------------------------------------------------------------
// predictions_for_repo
// ---------------------------------------------------------------------------

export interface PredictionsForRepoParams {
  fullName: string;
  horizon?: 14 | 30 | 90;
}

const VALID_HORIZONS: readonly number[] = [14, 30, 90];

function parsePredictionsForRepoParams(raw: unknown): PredictionsForRepoParams {
  if (raw === null || typeof raw !== "object") {
    throw new ParamError("params must be an object");
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.fullName !== "string" || !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(r.fullName)) {
    throw new ParamError("fullName must match 'owner/name'");
  }
  const out: PredictionsForRepoParams = { fullName: r.fullName };
  if (r.horizon !== undefined) {
    if (typeof r.horizon !== "number" || !VALID_HORIZONS.includes(r.horizon)) {
      throw new ParamError("horizon must be one of 14, 30, 90");
    }
    out.horizon = r.horizon as 14 | 30 | 90;
  }
  return out;
}

export async function predictionsForRepo(raw: unknown): Promise<unknown> {
  const params = parsePredictionsForRepoParams(raw);
  const horizon = params.horizon ?? 30;

  const repos = await getDerivedRepos();
  const repo = repos.find((x) => x.fullName === params.fullName);
  if (!repo) {
    throw new NotFoundError(`repo not tracked: ${params.fullName}`);
  }

  const store = getBuilderStore();
  const existing = await store.predictionsForSubject("repo", params.fullName);
  const today = new Date().toISOString().slice(0, 10);
  let prediction = existing.find(
    (p) =>
      p.archetype === "star_trajectory" &&
      p.horizonDays === horizon &&
      !p.outcome &&
      p.openedAt.slice(0, 10) === today,
  );
  if (!prediction) {
    prediction = buildStarTrajectoryPrediction({
      repoFullName: repo.fullName,
      sparklineData: repo.sparklineData,
      currentStars: repo.stars,
      horizonDays: horizon,
    });
    await store.upsertPrediction(prediction);
  }
  return {
    prediction,
    repo: {
      fullName: repo.fullName,
      stars: repo.stars,
      momentumScore: repo.momentumScore,
    },
  };
}

export const PREDICTIONS_FOR_REPO_PORTAL_PARAMS = {
  fullName: {
    type: "string",
    required: true,
    description: "GitHub full_name, e.g. 'vercel/next.js'.",
  },
  horizon: {
    type: "number",
    required: false,
    description: "Forecast horizon in days: 14, 30 (default), or 90.",
  },
} as const;

export const PREDICTIONS_FOR_REPO_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["fullName"],
  properties: {
    fullName: {
      type: "string",
      pattern: "^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$",
    },
    horizon: { type: "integer", enum: [14, 30, 90] },
  },
} as const;

export const PREDICTIONS_FOR_REPO_DESCRIPTION =
  "Return the active star-trajectory prediction for a repo. Method: auto_linear_vol_30d — OLS trend on the last 30 non-zero daily star counts, with a ±0.84σ residual band that widens with √horizon. Resolves automatically at resolvesAt.";
