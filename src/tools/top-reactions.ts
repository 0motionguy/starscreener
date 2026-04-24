// StarScreener — `top_reactions` agent tool.
//
// "What are builders excited about this week?" Aggregates reactions
// across all repos (and optionally ideas) in a time window and ranks
// by total reaction count of a chosen type. The strategy doc calls
// this out as the primary agent-read for answering "what's hot in
// builder intent right now."

import { listReactions } from "../lib/reactions";
import {
  REACTION_TYPES,
  type ReactionObjectType,
  type ReactionType,
} from "../lib/reactions-shape";
import { ParamError } from "./errors";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const WINDOW_MAP: Record<"24h" | "7d" | "30d" | "all", number | null> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  all: null,
};

export interface TopReactionsParams {
  type?: ReactionType | "any";
  objectType?: ReactionObjectType | "any";
  window?: "24h" | "7d" | "30d" | "all";
  limit?: number;
}

export interface TopReactionsItem {
  object_type: ReactionObjectType;
  object_id: string;
  counts: Record<ReactionType, number>;
  total: number;
}

export interface TopReactionsResult {
  window: "24h" | "7d" | "30d" | "all";
  type: ReactionType | "any";
  count: number;
  items: TopReactionsItem[];
}

export function parseTopReactionsParams(
  raw: unknown,
): TopReactionsParams {
  if (raw !== null && typeof raw !== "object") {
    throw new ParamError("params must be an object");
  }
  const r = (raw ?? {}) as Record<string, unknown>;
  const out: TopReactionsParams = {};

  if (r.type !== undefined) {
    if (
      r.type !== "any" &&
      !(REACTION_TYPES as readonly string[]).includes(r.type as string)
    ) {
      throw new ParamError(
        `type must be one of: 'any', ${REACTION_TYPES.join(", ")}`,
      );
    }
    out.type = r.type as ReactionType | "any";
  }

  if (r.objectType !== undefined) {
    if (
      r.objectType !== "any" &&
      r.objectType !== "repo" &&
      r.objectType !== "idea"
    ) {
      throw new ParamError("objectType must be 'any', 'repo', or 'idea'");
    }
    out.objectType = r.objectType as ReactionObjectType | "any";
  }

  if (r.window !== undefined) {
    if (
      r.window !== "24h" &&
      r.window !== "7d" &&
      r.window !== "30d" &&
      r.window !== "all"
    ) {
      throw new ParamError("window must be one of '24h' | '7d' | '30d' | 'all'");
    }
    out.window = r.window;
  }

  if (r.limit !== undefined) {
    if (typeof r.limit !== "number" || !Number.isFinite(r.limit) || r.limit < 1) {
      throw new ParamError("limit must be a positive integer");
    }
    out.limit = Math.min(Math.floor(r.limit), MAX_LIMIT);
  }

  return out;
}

function emptyCounts(): Record<ReactionType, number> {
  return { build: 0, use: 0, buy: 0, invest: 0 };
}

export async function topReactionsTool(
  raw: unknown,
): Promise<TopReactionsResult> {
  const params = parseTopReactionsParams(raw);
  const window = params.window ?? "7d";
  const type: ReactionType | "any" = params.type ?? "any";
  const objectType = params.objectType ?? "any";
  const limit = params.limit ?? DEFAULT_LIMIT;

  const all = await listReactions();
  const cutoffMs = WINDOW_MAP[window];
  const cutoff = cutoffMs === null ? 0 : Date.now() - cutoffMs;

  const filtered = all.filter((r) => {
    if (cutoff > 0 && Date.parse(r.createdAt) < cutoff) return false;
    if (objectType !== "any" && r.objectType !== objectType) return false;
    return true;
  });

  // Group by (objectType, objectId) and tally.
  type Key = string;
  const byKey = new Map<
    Key,
    {
      object_type: ReactionObjectType;
      object_id: string;
      counts: Record<ReactionType, number>;
    }
  >();
  for (const record of filtered) {
    const key = `${record.objectType}::${record.objectId}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        object_type: record.objectType,
        object_id: record.objectId,
        counts: emptyCounts(),
      };
      byKey.set(key, entry);
    }
    entry.counts[record.reactionType] += 1;
  }

  const items: TopReactionsItem[] = Array.from(byKey.values()).map((e) => {
    const total =
      type === "any"
        ? e.counts.build + e.counts.use + e.counts.buy + e.counts.invest
        : e.counts[type];
    return { ...e, total };
  });

  items.sort((a, b) => b.total - a.total);

  return {
    window,
    type,
    count: Math.min(items.length, limit),
    items: items.filter((i) => i.total > 0).slice(0, limit),
  };
}

export const TOP_REACTIONS_PORTAL_PARAMS = {
  type: {
    type: "string",
    required: false,
    description:
      "Reaction type to rank by, or 'any' (default) to sum across all four.",
  },
  objectType: {
    type: "string",
    required: false,
    description:
      "Filter to 'repo' or 'idea' reactions, or 'any' (default) to include both.",
  },
  window: {
    type: "string",
    required: false,
    description:
      "Time window: '24h', '7d' (default), '30d', or 'all' for lifetime.",
  },
  limit: {
    type: "number",
    required: false,
    description: `Max entries. Default ${DEFAULT_LIMIT}, clamped to ${MAX_LIMIT}.`,
  },
} as const;

export const TOP_REACTIONS_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: {
      type: "string",
      enum: ["any", "build", "use", "buy", "invest"],
      description: "Reaction type to rank by. Defaults to 'any'.",
    },
    objectType: {
      type: "string",
      enum: ["any", "repo", "idea"],
      description: "Filter by target kind. Defaults to 'any'.",
    },
    window: {
      type: "string",
      enum: ["24h", "7d", "30d", "all"],
      description: "Time window. Defaults to '7d'.",
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: MAX_LIMIT,
      description: `Max entries. Default ${DEFAULT_LIMIT}.`,
    },
  },
} as const;

export const TOP_REACTIONS_DESCRIPTION =
  "Rank objects (repos or ideas) by builder-reaction volume over a time window. Signals what the community is excited to build/use/buy/invest in right now.";
