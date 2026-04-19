// StarScreener — Agent-tool registry.
//
// Single source of truth for the three agent-facing tools exposed over
// Portal (/portal/call) and MCP (via @starscreener/mcp). Each entry owns:
//   - `name`          — canonical lowercase+underscore name
//   - `description`   — brief for LLMs (<=500 chars)
//   - `portalParams`  — Portal v0.1 sugar-form params
//   - `inputSchema`   — JSON Schema 2020-12 for MCP
//   - `handler(raw)`  — pure function; throws ParamError / NotFoundError
//
// Both the Portal dispatcher and the MCP server iterate this registry so
// adding a new tool is a one-file change and drift is structurally
// impossible.

import {
  TOP_GAINERS_DESCRIPTION,
  TOP_GAINERS_INPUT_SCHEMA,
  TOP_GAINERS_PORTAL_PARAMS,
  topGainers,
} from "./top-gainers";
import {
  SEARCH_REPOS_DESCRIPTION,
  SEARCH_REPOS_INPUT_SCHEMA,
  SEARCH_REPOS_PORTAL_PARAMS,
  searchRepos,
} from "./search-repos";
import {
  MAINTAINER_PROFILE_DESCRIPTION,
  MAINTAINER_PROFILE_INPUT_SCHEMA,
  MAINTAINER_PROFILE_PORTAL_PARAMS,
  maintainerProfile,
} from "./maintainer-profile";

export interface ToolDefinition {
  name: string;
  description: string;
  portalParams: Record<
    string,
    { type: string; required?: boolean; description?: string }
  >;
  inputSchema: object;
  handler: (raw: unknown) => unknown | Promise<unknown>;
}

export const TOOLS: ReadonlyArray<ToolDefinition> = [
  {
    name: "top_gainers",
    description: TOP_GAINERS_DESCRIPTION,
    portalParams: TOP_GAINERS_PORTAL_PARAMS,
    inputSchema: TOP_GAINERS_INPUT_SCHEMA,
    handler: topGainers,
  },
  {
    name: "search_repos",
    description: SEARCH_REPOS_DESCRIPTION,
    portalParams: SEARCH_REPOS_PORTAL_PARAMS,
    inputSchema: SEARCH_REPOS_INPUT_SCHEMA,
    handler: searchRepos,
  },
  {
    name: "maintainer_profile",
    description: MAINTAINER_PROFILE_DESCRIPTION,
    portalParams: MAINTAINER_PROFILE_PORTAL_PARAMS,
    inputSchema: MAINTAINER_PROFILE_INPUT_SCHEMA,
    handler: maintainerProfile,
  },
];

export const TOOLS_BY_NAME: ReadonlyMap<string, ToolDefinition> = new Map(
  TOOLS.map((t) => [t.name, t]),
);

export { ParamError, NotFoundError } from "./errors";
export type { ToolErrorCode } from "./errors";
export type {
  MaintainerProfileMinimal,
  RepoCard,
  SearchReposResult,
  TopGainersResult,
} from "./types";
export { topGainers } from "./top-gainers";
export { searchRepos } from "./search-repos";
export { maintainerProfile } from "./maintainer-profile";
