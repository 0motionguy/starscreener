// StarScreener — `top_gainers` agent tool.
//
// Thin wrapper over getTopMovers() from the pipeline query service. Adds a
// language filter (not present in the existing query because the terminal
// UI filters by category not language) and narrows the window to the
// Portal-friendly ISO-like labels "24h" / "7d" / "30d".

import { getTopMovers } from "../lib/pipeline/queries/service";
import type { TrendWindow } from "../lib/pipeline/types";
import { ParamError } from "./errors";
import { toRepoCard } from "./shared";
import type { TopGainersResult } from "./types";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const WINDOW_MAP: Record<"24h" | "7d" | "30d", TrendWindow> = {
  "24h": "today",
  "7d": "week",
  "30d": "month",
};

export interface TopGainersParams {
  limit?: number;
  language?: string;
  window?: "24h" | "7d" | "30d";
}

/** Validate and normalize raw params from the Portal/MCP boundary. */
export function parseTopGainersParams(raw: unknown): TopGainersParams {
  if (raw === null || typeof raw !== "object") {
    throw new ParamError("params must be an object");
  }
  const r = raw as Record<string, unknown>;
  const out: TopGainersParams = {};

  if (r.limit !== undefined) {
    if (typeof r.limit !== "number" || !Number.isFinite(r.limit) || r.limit < 1) {
      throw new ParamError("limit must be a positive integer");
    }
    out.limit = Math.min(Math.floor(r.limit), MAX_LIMIT);
  }

  if (r.language !== undefined) {
    if (typeof r.language !== "string" || r.language.length === 0) {
      throw new ParamError("language must be a non-empty string");
    }
    out.language = r.language;
  }

  if (r.window !== undefined) {
    if (r.window !== "24h" && r.window !== "7d" && r.window !== "30d") {
      throw new ParamError("window must be one of '24h' | '7d' | '30d'");
    }
    out.window = r.window;
  }

  return out;
}

export function topGainers(raw: unknown): TopGainersResult {
  const params = parseTopGainersParams(raw);
  const limit = params.limit ?? DEFAULT_LIMIT;
  const window: "24h" | "7d" | "30d" = params.window ?? "7d";

  // Fetch slightly more than needed so language filtering doesn't starve the
  // result set. If no language filter is set we fetch exactly `limit`.
  const fetchLimit = params.language ? Math.min(limit * 5, MAX_LIMIT * 5) : limit;
  let repos = getTopMovers(WINDOW_MAP[window], fetchLimit, "all");

  if (params.language) {
    const lang = params.language.toLowerCase();
    repos = repos.filter((r) => (r.language ?? "").toLowerCase() === lang);
  }

  repos = repos.slice(0, limit);

  return {
    window,
    count: repos.length,
    repos: repos.map(toRepoCard),
  };
}

/** Portal-manifest params sugar. */
export const TOP_GAINERS_PORTAL_PARAMS = {
  limit: {
    type: "number",
    required: false,
    description: `Max repos to return. Default ${DEFAULT_LIMIT}, clamped to ${MAX_LIMIT}.`,
  },
  window: {
    type: "string",
    required: false,
    description:
      "Time window for the star-delta sort. One of '24h', '7d' (default), '30d'.",
  },
  language: {
    type: "string",
    required: false,
    description:
      "Primary language filter (case-insensitive exact match, e.g. 'TypeScript').",
  },
} as const;

/** MCP-style JSON Schema (draft 2020-12). */
export const TOP_GAINERS_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    limit: {
      type: "integer",
      minimum: 1,
      maximum: MAX_LIMIT,
      description: `Max repos to return. Default ${DEFAULT_LIMIT}.`,
    },
    window: {
      type: "string",
      enum: ["24h", "7d", "30d"],
      description: "Time window for the star-delta sort. Defaults to '7d'.",
    },
    language: {
      type: "string",
      minLength: 1,
      description:
        "Primary language filter (case-insensitive exact match, e.g. 'TypeScript').",
    },
  },
} as const;

export const TOP_GAINERS_DESCRIPTION =
  "Return trending GitHub repos sorted by star delta over the chosen time window. Optional language filter.";
