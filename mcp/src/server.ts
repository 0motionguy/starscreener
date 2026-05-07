#!/usr/bin/env node
/**
 * TrendingRepo MCP server.
 *
 * Exposes the TrendingRepo GitHub trend platform to AI agents over stdio.
 * Reads from the Next.js REST API at TRENDINGREPO_API_URL (legacy:
 * STARSCREENER_API_URL; default http://localhost:3023). All tools are
 * read-only.
 *
 * Run: `node dist/server.js` (after `npm run build`) or `npm run dev`.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { TrendingRepoClient } from "./client.js";
import { PortalClient } from "./portal-client.js";
import {
  UNTRUSTED_CONTENT_NOTICE,
  run,
  withMetering as withMeteringRaw,
} from "./runtime.js";

// Single source of truth: mcp/package.json. Bump there and the
// MCP `initialize` handshake reflects it on the next build.
//
// This used to be a hand-typed literal that drifted from the package
// (server reported 0.1.0 while npm shipped 0.2.0). Reading at runtime
// closes the drift permanently.
const __serverDir = dirname(fileURLToPath(import.meta.url));
const MCP_VERSION: string = JSON.parse(
  readFileSync(resolvePath(__serverDir, "..", "package.json"), "utf8"),
).version;

// Re-export for tests that pin the notice string as part of the public
// contract.
export { UNTRUSTED_CONTENT_NOTICE };

const WindowEnum = z.enum(["24h", "7d", "30d"]);
const LimitField = z
  .number()
  .int()
  .min(1)
  .max(100)
  .describe("Maximum number of results (1-100). Default 20.");

// SocialPlatform union — must stay in sync with the server-side allow-list
// in src/app/api/repos/[owner]/[name]/mentions/route.ts. Duplicated locally
// rather than imported so the MCP package stays standalone (no @/lib import
// path).
const SocialPlatformEnum = z.enum([
  "reddit",
  "hackernews",
  "bluesky",
  "twitter",
  "devto",
  "github",
]);

const FullNameField = z
  .string()
  .min(3)
  .regex(/^[^/\s]+\/[^/\s]+$/, 'must be "owner/name"')
  .describe('GitHub-style slug like "vercel/next.js".');

const server = new McpServer(
  {
    name: "trendingrepo",
    version: MCP_VERSION,
  },
  {
    instructions:
      "TrendingRepo exposes live GitHub trend data (momentum score 0-100, " +
      "movement status, breakout detection, 30-day sparklines) for the " +
      "repos tracked by the TrendingRepo platform. All tools are read-only. " +
      "PRIMARY single-repo tool: repo_profile_full — one call returns the " +
      "full canonical profile (repo, score, reasons, mentions, freshness, " +
      "twitter, npm, productHunt, revenue, funding, related, prediction, " +
      "ideas). Companions: repo_mentions_page (paginated evidence), " +
      "repo_freshness (source scanner chips), repo_aiso (AISO scan status). " +
      "Canonical discovery tools (also exposed via Portal v0.1 at /portal): " +
      "top_gainers, search_repos, maintainer_profile. Additional legacy tools " +
      "kept for backwards compatibility: get_breakouts, get_new_repos, " +
      "compare_repos, get_categories, get_category_repos. 'get_trending' and " +
      "'get_repo' are deprecated — use 'top_gainers' and 'repo_profile_full' " +
      "instead. Windows map: 24h=today, 7d=week, 30d=month.",
  },
);

const client = new TrendingRepoClient();
const portal = new PortalClient();

// withMetering / run / UNTRUSTED_CONTENT_NOTICE live in ./runtime.ts.
// The thin wrapper below pins the TrendingRepoClient instance so each
// tool registration just calls withMetering(name, () => run(...)).
function withMetering<T>(tool: string, fn: () => Promise<T>): Promise<T> {
  return withMeteringRaw(client, tool, fn);
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

server.registerTool(
  "get_trending",
  {
    title: "Get trending repos",
    description:
      "[DEPRECATED — prefer top_gainers] Top-momentum repositories on " +
      "TrendingRepo over a time window. Returns { repos: Repo[], meta } where " +
      "each Repo includes momentumScore, movementStatus, stars deltas, " +
      "sparklineData, categoryId and rank.",
    inputSchema: {
      window: WindowEnum.optional().describe(
        'Time window: "24h" (today), "7d" (week, default), "30d" (month).',
      ),
      limit: LimitField.optional(),
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  async ({ window, limit }) =>
    withMetering("get_trending", () =>
      run(() => client.getTrending({ window, limit })),
    ),
);

// -------- New Portal-canonical tools — route through POST /portal/call --------

server.registerTool(
  "top_gainers",
  {
    title: "Top gainers",
    description:
      "Return trending GitHub repos sorted by star delta over the chosen time " +
      "window. Optional language filter. Routes through the TrendingRepo " +
      "Portal v0.1 endpoint so MCP and Portal visitors see identical results.",
    inputSchema: {
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Max repos to return (1-50). Default 10."),
      window: WindowEnum.optional().describe(
        "Time window for the star-delta sort. Defaults to '7d'.",
      ),
      language: z
        .string()
        .min(1)
        .optional()
        .describe(
          "Primary-language filter (case-insensitive exact match, e.g. 'TypeScript').",
        ),
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  async ({ limit, window, language }) =>
    withMetering("top_gainers", () =>
      run(() =>
        portal.call("top_gainers", {
          ...(limit !== undefined ? { limit } : {}),
          ...(window !== undefined ? { window } : {}),
          ...(language !== undefined ? { language } : {}),
        }),
      ),
    ),
);

server.registerTool(
  "maintainer_profile",
  {
    title: "Maintainer profile",
    description:
      "Aggregate profile for a GitHub handle, composed from repos TrendingRepo " +
      "already tracks where owner == handle. Returns total stars, " +
      "weekly velocity, languages, and top-momentum repos. NOT_FOUND when " +
      "the handle has no owned repos in the index. Does not make live " +
      "GitHub API calls.",
    inputSchema: {
      handle: z
        .string()
        .min(1)
        .max(39)
        .regex(
          /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/,
          "GitHub username (alnum + hyphen, no leading/trailing hyphen)",
        )
        .describe("GitHub username (the 'owner' part of owner/repo)."),
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  async ({ handle }) =>
    withMetering("maintainer_profile", () =>
      run(() => portal.call("maintainer_profile", { handle })),
    ),
);

// -----------------------------------------------------------------------------

server.registerTool(
  "get_breakouts",
  {
    title: "Get breakout repos",
    description:
      "Repos flagged as breakouts by the pipeline (movementStatus === " +
      '"breakout"), sorted by momentum score.',
    inputSchema: {
      limit: LimitField.optional(),
      window: WindowEnum.optional().describe(
        'Time window used to resolve star deltas. Default "7d".',
      ),
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  async ({ limit, window }) =>
    withMetering("get_breakouts", () =>
      run(() => client.getBreakouts({ limit, window })),
    ),
);

server.registerTool(
  "get_new_repos",
  {
    title: "Get new repos",
    description:
      "Recently-created repos (under 30 days old), sorted newest first.",
    inputSchema: {
      limit: LimitField.optional(),
      window: WindowEnum.optional().describe(
        'Time window used for delta context. Default "30d".',
      ),
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  async ({ limit, window }) =>
    withMetering("get_new_repos", () =>
      run(() => client.getNewRepos({ limit, window })),
    ),
);

server.registerTool(
  "search_repos",
  {
    title: "Search repos",
    description:
      "Full-text search across repo fullName, description, and topics. " +
      "Results are sorted by live momentum score.",
    inputSchema: {
      query: z
        .string()
        .min(1)
        .describe("Search query (matches fullName, description, topics)."),
      limit: LimitField.optional(),
      category: z
        .string()
        .optional()
        .describe("Optional categoryId to scope results."),
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  async ({ query, limit, category }) =>
    withMetering("search_repos", () =>
      run(() => client.searchRepos({ query, limit, category })),
    ),
);

server.registerTool(
  "get_repo",
  {
    title: "Get repo detail",
    description:
      "[DEPRECATED — prefer repo_profile_full] Full detail for a single " +
      'repo by "owner/name" fullName. Hits the legacy v1 shape (repo, ' +
      "score, category, reasons, social, mentions, twitterSignal, " +
      "whyMoving, relatedRepos, twitterAvailable). repo_profile_full " +
      "returns a superset (adds freshness, npm, productHunt, revenue, " +
      "funding, prediction, ideas) in one call. Kept for back-compat; " +
      "will be removed in a future version.",
    inputSchema: {
      fullName: FullNameField,
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  async ({ fullName }) =>
    withMetering("get_repo", () => run(() => client.getRepo({ fullName }))),
);

// ---------------------------------------------------------------------------
// Canonical single-repo tools — wrap /api/repos/[owner]/[name]?v=2 and
// siblings. Prefer repo_profile_full over get_repo for any new consumer.
// ---------------------------------------------------------------------------

server.registerTool(
  "repo_profile_full",
  {
    title: "Repo profile (full canonical)",
    description:
      "Return the full trending-repo profile in a single call: repo " +
      "metadata, score breakdown, human-readable movement reasons, recent " +
      "mentions (first-50 slice + nextCursor for repo_mentions_page), " +
      "per-source freshness, Twitter signal panel, npm packages with 30d " +
      "daily downloads + dependents counts, ProductHunt launch, revenue " +
      "overlays (verified / self-reported / trustmrr claim), funding " +
      "events, related repos, 30d prediction, and ideas. Use this as the " +
      "primary lookup for any question about a specific repo on " +
      "TrendingRepo. Returns 404 when the repo is unknown.",
    inputSchema: {
      fullName: FullNameField,
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  async ({ fullName }) =>
    withMetering("repo_profile_full", () =>
      run(() => client.getRepoProfileFull({ fullName })),
    ),
);

server.registerTool(
  "repo_mentions_page",
  {
    title: "Repo mentions (paginated)",
    description:
      "Walk the full persisted mention set for a repo beyond the 50-row " +
      "slice embedded in repo_profile_full. Cursor-based pagination over " +
      "(postedAt desc, id desc); pass the `nextCursor` from the previous " +
      "page back in unchanged. Optional `source` narrows to one platform " +
      "(reddit, hackernews, bluesky, twitter, devto, github). Returns " +
      "{ ok, fetchedAt, repo, count, nextCursor, items } where `items` is " +
      "an array of RepoMention.",
    inputSchema: {
      fullName: FullNameField,
      source: SocialPlatformEnum.optional().describe(
        "Narrow results to a single SocialPlatform.",
      ),
      cursor: z
        .string()
        .min(1)
        .optional()
        .describe(
          "Opaque base64url cursor returned by the previous page. Omit " +
            "for the first page.",
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe(
          "Page size (1-200). Default 50 matches the inline profile slice.",
        ),
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  async ({ fullName, source, cursor, limit }) =>
    withMetering("repo_mentions_page", () =>
      run(() =>
        client.getRepoMentionsPage({
          fullName,
          ...(source !== undefined ? { source } : {}),
          ...(cursor !== undefined ? { cursor } : {}),
          ...(limit !== undefined ? { limit } : {}),
        }),
      ),
    ),
);

server.registerTool(
  "repo_freshness",
  {
    title: "Repo source freshness",
    description:
      "Per-source scanner freshness snapshot for a known repo: returns " +
      "{ ok, fetchedAt, sources } where `sources` is a map keyed by " +
      "SocialPlatform giving the last successful scan timestamp and " +
      "staleness bucket (fresh/aging/stale). Freshness is global across " +
      "scanners (each firehose ingests all repos); the owner/name in the " +
      "request is used to 404 on unknown repos. Use this to render " +
      "\"reddit 2h · hn 4h · bluesky 3d\"-style chips alongside mentions.",
    inputSchema: {
      fullName: FullNameField,
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  async ({ fullName }) =>
    withMetering("repo_freshness", () =>
      run(() => client.getRepoFreshness({ fullName })),
    ),
);

server.registerTool(
  "repo_aiso",
  {
    title: "Repo AISO scan status",
    description:
      "AI discoverability (AISO) scan status for a repo's marketing site. " +
      "Returns { ok, status, score, tier, dimensions, topDimensions, " +
      "lastScanAt, signals, engineCitations, resultUrl } where `status` " +
      "is one of scanned | queued | rate_limited | failed | none. " +
      "`status: 'none'` means the repo is known but has no site or has " +
      "never been scanned. Read-only: this tool does NOT enqueue rescans.",
    inputSchema: {
      fullName: FullNameField,
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  async ({ fullName }) =>
    withMetering("repo_aiso", () =>
      run(() => client.getRepoAiso({ fullName })),
    ),
);

// ---------------------------------------------------------------------------
// Authenticated tools — scoped to the calling user's profile.
//
// `list_my_alerts` reads the caller's recent alert_events. Auth is delegated
// to the Next.js endpoint at /api/me/alert-events: this stdio MCP server
// forwards `Authorization: Bearer <token>` and the upstream route resolves
// the token to a profile (Clerk session JWT OR a `whmcp_<32 hex>` personal
// MCP token issued from /you/alerts). We never decrypt, hash, or peek at
// the token here — keeping all auth at the HTTP boundary lets the MCP
// package stay standalone (zero @clerk/backend / drizzle dependency).
//
// Token source on stdio: `TRENDINGREPO_USER_TOKEN` (legacy alias
// `STARSCREENER_USER_TOKEN`) in the MCP client's `env` block. See README
// "Authenticated tools" for the Claude Desktop / Claude Code config.
// ---------------------------------------------------------------------------

server.registerTool(
  "list_my_alerts",
  {
    title: "List my alert events",
    description:
      "Return the authenticated user's recent alert events from " +
      "TrendingRepo. Auth is required — pass either a Clerk session JWT " +
      "or a personal MCP token (whmcp_<32 hex>, issued at /you/alerts) " +
      "via `TRENDINGREPO_USER_TOKEN` in the MCP client's env block. " +
      "Returns `{ ok, events: AlertEvent[], nextCursor: string | null }` " +
      "where `nextCursor` is an ISO timestamp suitable as `before` on the " +
      "next call. Read-only: this tool only SELECTs.",
    inputSchema: {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Max events to return (1-100). Default 50."),
      before: z.iso
        .datetime()
        .optional()
        .describe(
          "ISO datetime — return events fired strictly before this " +
            "timestamp. Pass the previous response's `nextCursor` here " +
            "to paginate older events.",
        ),
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  async ({ limit, before }) =>
    withMetering("list_my_alerts", () =>
      run(async () => {
        const userToken = client.getUserToken();
        if (!userToken) {
          throw new Error(
            "list_my_alerts requires authentication. Set " +
              "TRENDINGREPO_USER_TOKEN in your MCP client's env block " +
              "(Clerk session JWT or whmcp_ token from /you/alerts).",
          );
        }
        const qs = new URLSearchParams();
        if (limit !== undefined) qs.set("limit", String(limit));
        if (before !== undefined) qs.set("before", before);
        const query = qs.toString();
        const url = `${client.getBaseUrl()}/api/me/alert-events${
          query.length > 0 ? `?${query}` : ""
        }`;
        const res = await globalThis.fetch(url, {
          method: "GET",
          headers: {
            accept: "application/json",
            // Forward the user token as a Bearer credential. The upstream
            // route is the single source of truth for auth — it accepts
            // both Clerk session JWTs and `whmcp_` tokens.
            authorization: `Bearer ${userToken}`,
          },
        });
        const text = await res.text();
        if (!res.ok) {
          // Upstream `requireUser()` redirects on a missing session, which
          // surfaces as a non-2xx (302) here. Treat any non-2xx as auth/
          // upstream failure and bubble the body so the LLM can see why.
          throw new Error(
            `list_my_alerts upstream ${res.status}: ${text.slice(0, 500)}`,
          );
        }
        if (!text) return { ok: true, events: [], nextCursor: null };
        try {
          return JSON.parse(text);
        } catch (err) {
          throw new Error(
            `list_my_alerts: invalid JSON from /api/me/alert-events: ${
              (err as Error).message
            }`,
          );
        }
      }),
    ),
);

server.registerTool(
  "compare_repos",
  {
    title: "Compare repos",
    description:
      "Side-by-side comparison of 2-4 repos with star/fork histories and " +
      "winner picks for momentum, stars, and 7d growth.",
    inputSchema: {
      fullNames: z
        .array(z.string().min(3))
        .min(2)
        .max(4)
        .describe(
          'Between 2 and 4 repo slugs ("owner/name" or "owner--name").',
        ),
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  async ({ fullNames }) =>
    withMetering("compare_repos", () =>
      run(() => client.compareRepos({ fullNames })),
    ),
);

server.registerTool(
  "get_categories",
  {
    title: "Get categories",
    description:
      "List all categories with live repoCount, avgMomentum, and topMoverId.",
    inputSchema: {},
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  async () =>
    withMetering("get_categories", () => run(() => client.getCategories())),
);

server.registerTool(
  "get_category_repos",
  {
    title: "Get category repos",
    description:
      "Repos inside a single category, sorted by momentum score.",
    inputSchema: {
      categoryId: z
        .string()
        .min(1)
        .describe(
          'Category id from get_categories (e.g. "ai-infra", "dev-tools").',
        ),
      limit: LimitField.optional(),
      window: WindowEnum.optional().describe(
        'Time window for delta context. Default "7d".',
      ),
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  async ({ categoryId, limit, window }) =>
    withMetering("get_category_repos", () =>
      run(() => client.getCategoryRepos({ categoryId, limit, window })),
    ),
);

// ---------------------------------------------------------------------------
// Wire up stdio transport and start.
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is reserved for the MCP JSON-RPC stream — log banner to stderr.
  console.error(
    `[trendingrepo-mcp] connected — API base: ${process.env.TRENDINGREPO_API_URL ?? process.env.STARSCREENER_API_URL ?? "http://localhost:3023"}`,
  );
}

process.on("SIGINT", async () => {
  await server.close().catch(() => undefined);
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await server.close().catch(() => undefined);
  process.exit(0);
});

main().catch((err) => {
  console.error("[trendingrepo-mcp] fatal:", err);
  process.exit(1);
});
