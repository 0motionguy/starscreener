// StarScreener — `search_repos` agent tool.
//
// Thin wrapper over searchReposByQuery() from the pipeline query service.
// Case-insensitive substring match over fullName + description + topics,
// sorted by momentum score desc.

import { searchReposByQuery } from "../lib/pipeline/queries/service";
import { ParamError } from "./errors";
import { toRepoCard } from "./shared";
import type { SearchReposResult } from "./types";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export interface SearchReposParams {
  query: string;
  limit?: number;
}

export function parseSearchReposParams(raw: unknown): SearchReposParams {
  if (raw === null || typeof raw !== "object") {
    throw new ParamError("params must be an object");
  }
  const r = raw as Record<string, unknown>;

  if (typeof r.query !== "string" || r.query.trim().length === 0) {
    throw new ParamError("query is required and must be a non-empty string");
  }
  const out: SearchReposParams = { query: r.query.trim() };

  if (r.limit !== undefined) {
    if (typeof r.limit !== "number" || !Number.isFinite(r.limit) || r.limit < 1) {
      throw new ParamError("limit must be a positive integer");
    }
    out.limit = Math.min(Math.floor(r.limit), MAX_LIMIT);
  }

  return out;
}

export function searchRepos(raw: unknown): SearchReposResult {
  const params = parseSearchReposParams(raw);
  const limit = params.limit ?? DEFAULT_LIMIT;

  const hits = searchReposByQuery(params.query, { limit });

  return {
    query: params.query,
    count: hits.length,
    repos: hits.map(toRepoCard),
  };
}

export const SEARCH_REPOS_PORTAL_PARAMS = {
  query: {
    type: "string",
    required: true,
    description:
      "Case-insensitive substring searched across repo full_name, description, and topics.",
  },
  limit: {
    type: "number",
    required: false,
    description: `Max repos to return. Default ${DEFAULT_LIMIT}, clamped to ${MAX_LIMIT}.`,
  },
} as const;

export const SEARCH_REPOS_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["query"],
  properties: {
    query: {
      type: "string",
      minLength: 1,
      description:
        "Case-insensitive substring searched across repo full_name, description, and topics.",
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: MAX_LIMIT,
      description: `Max repos to return. Default ${DEFAULT_LIMIT}.`,
    },
  },
} as const;

export const SEARCH_REPOS_DESCRIPTION =
  "Full-text search over Star Screener's indexed repos. Matches fullName, description, and topics. Results sorted by momentum score desc.";
