#!/usr/bin/env node
/**
 * StarScreener MCP server.
 *
 * Exposes the StarScreener GitHub trend platform to AI agents over stdio.
 * Reads from the Next.js REST API at STARSCREENER_API_URL (default
 * http://localhost:3004). All tools are read-only.
 *
 * Run: `node dist/server.js` (after `npm run build`) or `npm run dev`.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { StarScreenerClient, StarScreenerApiError } from "./client.js";

const WindowEnum = z.enum(["24h", "7d", "30d"]);
const LimitField = z
  .number()
  .int()
  .min(1)
  .max(100)
  .describe("Maximum number of results (1-100). Default 20.");

const server = new McpServer(
  {
    name: "starscreener",
    version: "0.1.0",
  },
  {
    instructions:
      "StarScreener exposes live GitHub trend data (momentum score 0-100, " +
      "movement status, breakout detection, 30-day sparklines) for the " +
      "repos tracked by the StarScreener platform. All tools are read-only. " +
      "Start with get_trending or get_breakouts for discovery; use get_repo " +
      "for a full detail view with sparkline + reasons. Windows map: 24h=today, " +
      "7d=week, 30d=month.",
  },
);

const client = new StarScreenerClient();

// ---------------------------------------------------------------------------
// Small helper: wrap a tool handler so thrown errors (network, API 4xx/5xx,
// invalid input) surface as a proper MCP tool error rather than crashing the
// stdio loop.
// ---------------------------------------------------------------------------

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    const data = await fn();
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  } catch (err) {
    const message =
      err instanceof StarScreenerApiError
        ? `StarScreener API error ${err.status} at ${err.url}: ${err.body.slice(0, 500)}`
        : err instanceof Error
          ? err.message
          : String(err);
    return {
      content: [{ type: "text", text: message }],
      isError: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

server.registerTool(
  "get_trending",
  {
    title: "Get trending repos",
    description:
      "Top-momentum repositories on StarScreener over a time window. " +
      "Returns { repos: Repo[], meta } where each Repo includes momentumScore, " +
      "movementStatus, stars deltas, sparklineData, categoryId and rank.",
    inputSchema: {
      window: WindowEnum.optional().describe(
        'Time window: "24h" (today), "7d" (week, default), "30d" (month).',
      ),
      limit: LimitField.optional(),
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  async ({ window, limit }) =>
    run(() => client.getTrending({ window, limit })),
);

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
    run(() => client.getBreakouts({ limit, window })),
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
    run(() => client.getNewRepos({ limit, window })),
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
    run(() => client.searchRepos({ query, limit, category })),
);

server.registerTool(
  "get_repo",
  {
    title: "Get repo detail",
    description:
      'Full detail for a single repo by "owner/name" fullName. Includes ' +
      "the Repo object (sparkline, momentum, deltas), score breakdown, " +
      "category, movement reasons, social buzz aggregates, related repos.",
    inputSchema: {
      fullName: z
        .string()
        .min(3)
        .regex(/^[^/\s]+\/[^/\s]+$/, 'must be "owner/name"')
        .describe('GitHub-style slug like "vercel/next.js".'),
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  async ({ fullName }) => run(() => client.getRepo({ fullName })),
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
  async ({ fullNames }) => run(() => client.compareRepos({ fullNames })),
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
  async () => run(() => client.getCategories()),
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
    run(() => client.getCategoryRepos({ categoryId, limit, window })),
);

// ---------------------------------------------------------------------------
// Wire up stdio transport and start.
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is reserved for the MCP JSON-RPC stream — log banner to stderr.
  console.error(
    `[starscreener-mcp] connected — API base: ${process.env.STARSCREENER_API_URL ?? "http://localhost:3004"}`,
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
  console.error("[starscreener-mcp] fatal:", err);
  process.exit(1);
});
