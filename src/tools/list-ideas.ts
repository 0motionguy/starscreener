// StarScreener — `list_ideas` agent tool.
//
// Public read of the idea feed with the three sort modes the /ideas
// page uses (hot / new / shipped). Returns the same PublicIdea shape
// plus per-idea reaction counts so agents don't need a second round
// trip to know which ideas are hot right now.

import { hotScore, listIdeas, toPublicIdea, type PublicIdea } from "../lib/ideas";
import {
  countReactions,
  listReactionsForObject,
} from "../lib/reactions";
import type { ReactionCounts } from "../lib/reactions-shape";
import { ParamError } from "./errors";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export interface ListIdeasParams {
  sort?: "hot" | "new" | "shipped";
  limit?: number;
}

export interface ListIdeasItem extends PublicIdea {
  reaction_counts: ReactionCounts;
  hot_score?: number;
}

export interface ListIdeasResult {
  sort: "hot" | "new" | "shipped";
  count: number;
  ideas: ListIdeasItem[];
}

export function parseListIdeasParams(raw: unknown): ListIdeasParams {
  if (raw !== null && typeof raw !== "object") {
    throw new ParamError("params must be an object");
  }
  const r = (raw ?? {}) as Record<string, unknown>;
  const out: ListIdeasParams = {};

  if (r.sort !== undefined) {
    if (r.sort !== "hot" && r.sort !== "new" && r.sort !== "shipped") {
      throw new ParamError("sort must be one of 'hot' | 'new' | 'shipped'");
    }
    out.sort = r.sort;
  }
  if (r.limit !== undefined) {
    if (typeof r.limit !== "number" || !Number.isFinite(r.limit) || r.limit < 1) {
      throw new ParamError("limit must be a positive integer");
    }
    out.limit = Math.min(Math.floor(r.limit), MAX_LIMIT);
  }
  return out;
}

export async function listIdeasTool(raw: unknown): Promise<ListIdeasResult> {
  const params = parseListIdeasParams(raw);
  const sort = params.sort ?? "hot";
  const limit = params.limit ?? DEFAULT_LIMIT;

  const all = await listIdeas();
  const visible = all.filter(
    (r) => r.status === "published" || r.status === "shipped",
  );

  const withCounts = await Promise.all(
    visible.map(async (record) => {
      const reactions = await listReactionsForObject("idea", record.id);
      const counts = countReactions(reactions);
      return { record, counts };
    }),
  );

  const now = Date.now();
  let ranked: typeof withCounts;
  if (sort === "shipped") {
    ranked = withCounts
      .filter(
        (r) =>
          r.record.buildStatus === "shipped" || r.record.status === "shipped",
      )
      .sort(
        (a, b) =>
          Date.parse(b.record.publishedAt ?? b.record.createdAt) -
          Date.parse(a.record.publishedAt ?? a.record.createdAt),
      );
  } else if (sort === "new") {
    ranked = withCounts.sort(
      (a, b) =>
        Date.parse(b.record.publishedAt ?? b.record.createdAt) -
        Date.parse(a.record.publishedAt ?? a.record.createdAt),
    );
  } else {
    ranked = withCounts.sort((a, b) => {
      const sa = hotScore(
        { createdAt: a.record.publishedAt ?? a.record.createdAt },
        a.counts,
        now,
      );
      const sb = hotScore(
        { createdAt: b.record.publishedAt ?? b.record.createdAt },
        b.counts,
        now,
      );
      return sb - sa;
    });
  }

  const top = ranked.slice(0, limit);

  return {
    sort,
    count: top.length,
    ideas: top.map(({ record, counts }) => {
      const pub = toPublicIdea(record);
      const item: ListIdeasItem = {
        ...pub,
        reaction_counts: counts,
      };
      if (sort === "hot") {
        item.hot_score = hotScore(
          { createdAt: pub.publishedAt ?? pub.createdAt },
          counts,
          now,
        );
      }
      return item;
    }),
  };
}

export const LIST_IDEAS_PORTAL_PARAMS = {
  sort: {
    type: "string",
    required: false,
    description:
      "Sort order. 'hot' (default — weighted reactions × recency decay), 'new' (chronological), 'shipped' (buildStatus=shipped only).",
  },
  limit: {
    type: "number",
    required: false,
    description: `Max ideas to return. Default ${DEFAULT_LIMIT}, clamped to ${MAX_LIMIT}.`,
  },
} as const;

export const LIST_IDEAS_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    sort: {
      type: "string",
      enum: ["hot", "new", "shipped"],
      description: "Sort mode for the feed.",
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: MAX_LIMIT,
      description: `Max ideas. Default ${DEFAULT_LIMIT}.`,
    },
  },
} as const;

export const LIST_IDEAS_DESCRIPTION =
  "List public builder ideas with reaction counts. 'hot' ranks by weighted reactions (build*3 + use*1 + buy*5 + invest*8) decayed by recency; 'new' is chronological; 'shipped' filters to ideas whose authors have marked them shipped.";
