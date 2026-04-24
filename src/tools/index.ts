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
import {
  LIST_IDEAS_DESCRIPTION,
  LIST_IDEAS_INPUT_SCHEMA,
  LIST_IDEAS_PORTAL_PARAMS,
  listIdeasTool,
} from "./list-ideas";
import {
  GET_IDEA_DESCRIPTION,
  GET_IDEA_INPUT_SCHEMA,
  GET_IDEA_PORTAL_PARAMS,
  getIdeaTool,
} from "./get-idea";
import {
  TOP_REACTIONS_DESCRIPTION,
  TOP_REACTIONS_INPUT_SCHEMA,
  TOP_REACTIONS_PORTAL_PARAMS,
  topReactionsTool,
} from "./top-reactions";
import {
  PREDICT_REPO_DESCRIPTION,
  PREDICT_REPO_INPUT_SCHEMA,
  PREDICT_REPO_PORTAL_PARAMS,
  predictRepoTool,
} from "./predict-repo";
import {
  SUBMIT_IDEA_DESCRIPTION,
  SUBMIT_IDEA_INPUT_SCHEMA,
  SUBMIT_IDEA_PORTAL_PARAMS,
  submitIdeaTool,
} from "./submit-idea";
import {
  REACT_TO_DESCRIPTION,
  REACT_TO_INPUT_SCHEMA,
  REACT_TO_PORTAL_PARAMS,
  reactToTool,
} from "./react-to";

/**
 * Optional context the dispatcher threads into the handler call site.
 * Read-only tools ignore it. Write tools (submit_idea, react_to)
 * require `principal` and throw AuthError when it's missing.
 *
 * `principal` is set by the route layer after a successful
 * verifyInternalAgentAuth — for INTERNAL_AGENT_TOKENS_JSON it's the
 * agent name; for the cron-secret fallback it's the literal string
 * "cron_secret". Tool handlers use this string as the authorId of any
 * row they create on behalf of the caller.
 */
export interface ToolCallContext {
  principal?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  portalParams: Record<
    string,
    { type: string; required?: boolean; description?: string }
  >;
  inputSchema: object;
  /**
   * Handlers may declare `(raw)` and ignore the context, or `(raw, ctx)`
   * to gate on auth. The dispatcher passes the context unconditionally;
   * TS allows the narrower one-arg form via parameter bivariance.
   */
  handler: (
    raw: unknown,
    ctx?: ToolCallContext,
  ) => unknown | Promise<unknown>;
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
  {
    name: "list_ideas",
    description: LIST_IDEAS_DESCRIPTION,
    portalParams: LIST_IDEAS_PORTAL_PARAMS,
    inputSchema: LIST_IDEAS_INPUT_SCHEMA,
    handler: listIdeasTool,
  },
  {
    name: "get_idea",
    description: GET_IDEA_DESCRIPTION,
    portalParams: GET_IDEA_PORTAL_PARAMS,
    inputSchema: GET_IDEA_INPUT_SCHEMA,
    handler: getIdeaTool,
  },
  {
    name: "top_reactions",
    description: TOP_REACTIONS_DESCRIPTION,
    portalParams: TOP_REACTIONS_PORTAL_PARAMS,
    inputSchema: TOP_REACTIONS_INPUT_SCHEMA,
    handler: topReactionsTool,
  },
  {
    name: "predict_repo",
    description: PREDICT_REPO_DESCRIPTION,
    portalParams: PREDICT_REPO_PORTAL_PARAMS,
    inputSchema: PREDICT_REPO_INPUT_SCHEMA,
    handler: predictRepoTool,
  },
  {
    name: "submit_idea",
    description: SUBMIT_IDEA_DESCRIPTION,
    portalParams: SUBMIT_IDEA_PORTAL_PARAMS,
    inputSchema: SUBMIT_IDEA_INPUT_SCHEMA,
    handler: submitIdeaTool,
  },
  {
    name: "react_to",
    description: REACT_TO_DESCRIPTION,
    portalParams: REACT_TO_PORTAL_PARAMS,
    inputSchema: REACT_TO_INPUT_SCHEMA,
    handler: reactToTool,
  },
];

export const TOOLS_BY_NAME: ReadonlyMap<string, ToolDefinition> = new Map(
  TOOLS.map((t) => [t.name, t]),
);

export { AuthError, ParamError, NotFoundError } from "./errors";
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
export { listIdeasTool } from "./list-ideas";
export { getIdeaTool } from "./get-idea";
export { topReactionsTool } from "./top-reactions";
export { predictRepoTool } from "./predict-repo";
export { submitIdeaTool } from "./submit-idea";
export { reactToTool } from "./react-to";
