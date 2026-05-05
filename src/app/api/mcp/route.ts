// POST /api/mcp — HTTP MCP server endpoint for trendingrepo.com.
//
// Implements the Model Context Protocol over HTTP via JSON-RPC 2.0 so any
// MCP client that speaks the streamable-http / standalone-http transport
// (Claude Desktop, Cursor, Continue, custom agents) can call our four
// canonical read-only tools without a stdio bridge. The legacy stdio
// server in `mcp/` continues to work for clients that prefer subprocess
// transport — this route is the dogfood path for trendingrepo.com itself.
//
// Methods supported:
//   - initialize           → handshake + capability advertisement
//   - tools/list           → enumerate the 4 tools in this build
//   - tools/call           → invoke a tool, return MCP content envelope
//   - notifications/initialized → no-op accept
//   - ping                 → liveness
//
// Tools:
//   - get_trending(window?, category?, limit?)
//   - get_repo(owner, name)
//   - get_mentions(owner, name, source?, since?, limit?)
//   - search_repos(query, limit?, category?)
//
// All tool implementations route through same-origin internal Next.js
// routes (`/api/repos`, `/api/repos/[owner]/[name]`, `/api/repos/[owner]/[name]/mentions`,
// `/api/search`) so the MCP layer sees the same data + cache posture the
// rest of the platform serves. No re-validation, no data-store re-init —
// the routes are already the source of truth.
//
// Auth: public read. The four tools are the same ones we serve unauth'd
// over the REST API; gating them here would just push every MCP client to
// scrape the public routes.
//
// SAM-06 / AGN-947.

import { NextRequest, NextResponse } from "next/server";
// lint-allow: no-parsebody — JSON-RPC envelope requires custom request.json parsing.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
} as const;

const PROTOCOL_VERSION = "2025-03-26";
const SERVER_NAME = "trendingrepo";
const SERVER_VERSION = "0.1.0";

// ---------------------------------------------------------------------------
// JSON-RPC envelope
// ---------------------------------------------------------------------------

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  id?: JsonRpcId;
  params?: unknown;
}

interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: unknown;
}

interface JsonRpcError {
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: { code: number; message: string; data?: unknown };
}

type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

// JSON-RPC error codes — we map MCP's documented method-not-found / invalid-params
// onto the standard JSON-RPC numeric codes.
const ERR_PARSE = -32700;
const ERR_INVALID_REQUEST = -32600;
const ERR_METHOD_NOT_FOUND = -32601;
const ERR_INVALID_PARAMS = -32602;
const ERR_INTERNAL = -32603;

function rpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcError {
  const err: JsonRpcError["error"] = { code, message };
  if (data !== undefined) err.data = data;
  return { jsonrpc: "2.0", id, error: err };
}

function rpcOk(id: JsonRpcId, result: unknown): JsonRpcSuccess {
  return { jsonrpc: "2.0", id, result };
}

// ---------------------------------------------------------------------------
// Tool registry — schemas mirror the four tools called out in SAM-06.
// ---------------------------------------------------------------------------

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const WINDOW_VALUES = ["1h", "6h", "24h", "7d"] as const;
type WindowValue = (typeof WINDOW_VALUES)[number];
const SOURCE_VALUES = [
  "reddit",
  "hackernews",
  "bluesky",
  "twitter",
  "devto",
  "github",
] as const;

const TOOLS: ToolDef[] = [
  {
    name: "get_trending",
    description:
      "Top-momentum GitHub repositories tracked by trendingrepo.com over the chosen window. Returns the same payload the public /api/repos route serves (Repo[] with momentumScore, movementStatus, stars deltas, sparklineData, rank).",
    inputSchema: {
      type: "object",
      properties: {
        window: {
          type: "string",
          enum: [...WINDOW_VALUES],
          description:
            "Time window: '1h', '6h', '24h' (today), or '7d' (week, default).",
        },
        category: {
          type: "string",
          description:
            "Optional categoryId from /api/categories (e.g. 'ai-infra', 'dev-tools').",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Max repos to return (1-100). Default 20.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_repo",
    description:
      "Full canonical profile for a single repo by owner + name. Wraps GET /api/repos/{owner}/{name}?v=2 — repo metadata, score breakdown, movement reasons, recent mentions, freshness, twitter signal, npm, ProductHunt, revenue, funding, related repos.",
    inputSchema: {
      type: "object",
      required: ["owner", "name"],
      properties: {
        owner: {
          type: "string",
          minLength: 1,
          description: "GitHub owner (the part before the slash).",
        },
        name: {
          type: "string",
          minLength: 1,
          description: "GitHub repo name (the part after the slash).",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_mentions",
    description:
      "Cursor-paginated mentions feed for a repo across reddit, hackernews, bluesky, twitter, devto, github. Wraps GET /api/repos/{owner}/{name}/mentions. Pass an ISO-8601 'since' to slice older entries.",
    inputSchema: {
      type: "object",
      required: ["owner", "name"],
      properties: {
        owner: { type: "string", minLength: 1 },
        name: { type: "string", minLength: 1 },
        source: {
          type: "string",
          enum: [...SOURCE_VALUES],
          description: "Optional: narrow to a single platform.",
        },
        since: {
          type: "string",
          description:
            "ISO-8601 timestamp; only mentions posted at-or-after this time are returned.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 200,
          description: "Page size (1-200). Default 50.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "search_repos",
    description:
      "Full-text search across the trendingrepo.com index (fullName, description, topics). Results sorted by live momentum score. Wraps GET /api/search.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", minLength: 1 },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Max results (1-100). Default 20.",
        },
        category: {
          type: "string",
          description: "Optional categoryId to scope results.",
        },
      },
      additionalProperties: false,
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function readStringField(
  obj: Record<string, unknown>,
  key: string,
): string | undefined {
  const raw = obj[key];
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readIntField(
  obj: Record<string, unknown>,
  key: string,
): number | undefined {
  const raw = obj[key];
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  return Math.trunc(raw);
}

const SLUG_PART = /^[A-Za-z0-9._-]+$/;
function validateSlugPart(value: string, field: string): string {
  if (!SLUG_PART.test(value)) {
    throw new InvalidParams(`${field} contains invalid characters`);
  }
  return value;
}

// Map our MCP windows → /api/repos period vocabulary. The internal route
// only knows today/week/month; we collapse the sub-day granularities onto
// 'today' so we don't 400 the upstream.
function windowToPeriod(value: WindowValue): "today" | "week" | "month" {
  switch (value) {
    case "1h":
    case "6h":
    case "24h":
      return "today";
    case "7d":
      return "week";
  }
}

class InvalidParams extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidParams";
  }
}

class ToolExecError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    super(`upstream returned ${status}`);
    this.name = "ToolExecError";
    this.status = status;
    this.body = body;
  }
}

// Same-origin fetch — relative URLs can't be resolved by global fetch in
// node, so anchor against the incoming request's origin. Forwards the
// caller's accept-language so locale-aware downstream routes behave the
// same as a direct browser hit.
async function originFetch(
  request: NextRequest,
  pathAndQuery: string,
): Promise<{ status: number; body: unknown }> {
  const origin = new URL(request.url).origin;
  const url = `${origin}${pathAndQuery}`;
  const upstream = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  const text = await upstream.text();
  let body: unknown = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      // Non-JSON body (HTML error page from a misrouted request); pass the
      // raw string through so the model has something to work with.
      body = text;
    }
  }
  if (!upstream.ok) {
    throw new ToolExecError(upstream.status, body);
  }
  return { status: upstream.status, body };
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

async function callGetTrending(
  request: NextRequest,
  args: Record<string, unknown>,
): Promise<unknown> {
  const windowStr = readStringField(args, "window");
  const window = (
    windowStr && (WINDOW_VALUES as readonly string[]).includes(windowStr)
      ? windowStr
      : "7d"
  ) as WindowValue;
  const limit = readIntField(args, "limit");
  const category = readStringField(args, "category");
  const qs = new URLSearchParams();
  qs.set("period", windowToPeriod(window));
  qs.set("limit", String(Math.min(100, Math.max(1, limit ?? 20))));
  if (category) qs.set("category", category);
  qs.set("sort", "momentum");
  const { body } = await originFetch(request, `/api/repos?${qs.toString()}`);
  return body;
}

async function callGetRepo(
  request: NextRequest,
  args: Record<string, unknown>,
): Promise<unknown> {
  const owner = readStringField(args, "owner");
  const name = readStringField(args, "name");
  if (!owner) throw new InvalidParams("owner is required");
  if (!name) throw new InvalidParams("name is required");
  validateSlugPart(owner, "owner");
  validateSlugPart(name, "name");
  const { body } = await originFetch(
    request,
    `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}?v=2`,
  );
  return body;
}

async function callGetMentions(
  request: NextRequest,
  args: Record<string, unknown>,
): Promise<unknown> {
  const owner = readStringField(args, "owner");
  const name = readStringField(args, "name");
  if (!owner) throw new InvalidParams("owner is required");
  if (!name) throw new InvalidParams("name is required");
  validateSlugPart(owner, "owner");
  validateSlugPart(name, "name");
  const source = readStringField(args, "source");
  if (source && !(SOURCE_VALUES as readonly string[]).includes(source)) {
    throw new InvalidParams(
      `source must be one of: ${SOURCE_VALUES.join(", ")}`,
    );
  }
  const since = readStringField(args, "since");
  const limit = readIntField(args, "limit");
  const qs = new URLSearchParams();
  if (source) qs.set("source", source);
  if (since) qs.set("since", since);
  if (limit !== undefined) {
    qs.set("limit", String(Math.min(200, Math.max(1, limit))));
  }
  const suffix = qs.toString().length > 0 ? `?${qs.toString()}` : "";
  const { body } = await originFetch(
    request,
    `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/mentions${suffix}`,
  );
  return body;
}

async function callSearchRepos(
  request: NextRequest,
  args: Record<string, unknown>,
): Promise<unknown> {
  const query = readStringField(args, "query");
  if (!query) throw new InvalidParams("query is required");
  const limit = readIntField(args, "limit");
  const category = readStringField(args, "category");
  const qs = new URLSearchParams();
  qs.set("q", query);
  qs.set("limit", String(Math.min(100, Math.max(1, limit ?? 20))));
  if (category) qs.set("category", category);
  const { body } = await originFetch(request, `/api/search?${qs.toString()}`);
  return body;
}

// ---------------------------------------------------------------------------
// MCP method dispatch
// ---------------------------------------------------------------------------

interface InitializeResult {
  protocolVersion: string;
  capabilities: { tools: { listChanged: boolean } };
  serverInfo: { name: string; version: string };
  instructions: string;
}

function handleInitialize(): InitializeResult {
  return {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    instructions:
      "trendingrepo.com MCP — read-only tools backed by the public REST surface. Use get_trending for the leaderboard, search_repos to find a repo by free text, get_repo for the full canonical profile, and get_mentions for the cross-platform evidence feed.",
  };
}

function handleToolsList(): { tools: ToolDef[] } {
  return { tools: TOOLS };
}

async function handleToolsCall(
  request: NextRequest,
  params: unknown,
): Promise<unknown> {
  const obj = asObject(params);
  const name = readStringField(obj, "name");
  if (!name) throw new InvalidParams("tool name is required");
  const args = asObject(obj.arguments);
  let result: unknown;
  try {
    switch (name) {
      case "get_trending":
        result = await callGetTrending(request, args);
        break;
      case "get_repo":
        result = await callGetRepo(request, args);
        break;
      case "get_mentions":
        result = await callGetMentions(request, args);
        break;
      case "search_repos":
        result = await callSearchRepos(request, args);
        break;
      default:
        throw new InvalidParams(`unknown tool: ${name}`);
    }
  } catch (err) {
    if (err instanceof InvalidParams) throw err;
    if (err instanceof ToolExecError) {
      // Surface upstream errors as a structured tool-error result so the
      // model can reason about them. Per MCP spec, transport-level errors
      // and tool-execution errors are distinct: invalid args throw
      // JSON-RPC errors, but a 404/500 from a downstream route is part of
      // the tool's normal contract.
      return {
        content: [
          {
            type: "text",
            text: `tool ${name} failed (HTTP ${err.status}): ${
              typeof err.body === "string"
                ? err.body
                : JSON.stringify(err.body)
            }`,
          },
        ],
        isError: true,
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `tool ${name} threw: ${message}` }],
      isError: true,
    };
  }
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    structuredContent: result,
    isError: false,
  };
}

// ---------------------------------------------------------------------------
// Single-request dispatcher
// ---------------------------------------------------------------------------

async function dispatch(
  request: NextRequest,
  rpc: JsonRpcRequest,
): Promise<JsonRpcResponse | null> {
  const id = rpc.id ?? null;
  if (rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") {
    return rpcError(id, ERR_INVALID_REQUEST, "invalid JSON-RPC envelope");
  }
  // Notifications (no id) — accept without response per JSON-RPC 2.0.
  const isNotification = rpc.id === undefined;
  try {
    switch (rpc.method) {
      case "initialize":
        return rpcOk(id, handleInitialize());
      case "notifications/initialized":
      case "notifications/cancelled":
        // Spec-defined notifications. No reply for notifications; for
        // request-form invocations (with id) we return an empty result.
        if (isNotification) return null;
        return rpcOk(id, {});
      case "ping":
        return rpcOk(id, {});
      case "tools/list":
        return rpcOk(id, handleToolsList());
      case "tools/call":
        return rpcOk(id, await handleToolsCall(request, rpc.params));
      default:
        if (isNotification) return null;
        return rpcError(
          id,
          ERR_METHOD_NOT_FOUND,
          `method not found: ${rpc.method}`,
        );
    }
  } catch (err) {
    if (err instanceof InvalidParams) {
      return rpcError(id, ERR_INVALID_PARAMS, err.message);
    }
    const message = err instanceof Error ? err.message : String(err);
    return rpcError(id, ERR_INTERNAL, "internal error", { detail: message });
  }
}

// ---------------------------------------------------------------------------
// HTTP entry points
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      rpcError(null, ERR_PARSE, `invalid JSON: ${message}`),
      { status: 400, headers: RESPONSE_HEADERS },
    );
  }

  // Batch support — JSON-RPC 2.0 allows an array of requests in one POST.
  if (Array.isArray(payload)) {
    const results: JsonRpcResponse[] = [];
    for (const item of payload) {
      const rpc = item as JsonRpcRequest;
      const out = await dispatch(request, rpc);
      if (out) results.push(out);
    }
    // If every request was a notification, return 204 per spec.
    if (results.length === 0) {
      return new NextResponse(null, {
        status: 204,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return NextResponse.json(results, {
      status: 200,
      headers: RESPONSE_HEADERS,
    });
  }

  if (payload === null || typeof payload !== "object") {
    return NextResponse.json(
      rpcError(null, ERR_INVALID_REQUEST, "expected JSON object or array"),
      { status: 400, headers: RESPONSE_HEADERS },
    );
  }

  const rpc = payload as JsonRpcRequest;
  const out = await dispatch(request, rpc);
  if (!out) {
    // Pure notification — JSON-RPC says no body.
    return new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const status = "error" in out ? errorStatusFor(out.error.code) : 200;
  return NextResponse.json(out, { status, headers: RESPONSE_HEADERS });
}

// MCP discovery: a bare GET returns the manifest summary so curl users +
// clients that probe the endpoint can confirm the server is alive. The
// spec doesn't require this, but it's the same affordance the stdio
// server's banner provides.
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      ok: true as const,
      protocolVersion: PROTOCOL_VERSION,
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      transport: "http+json-rpc",
      tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
      manifest: "/.well-known/mcp.json",
      hint: "POST a JSON-RPC 2.0 envelope here to invoke tools — try {\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}.",
    },
    { status: 200, headers: RESPONSE_HEADERS },
  );
}

// JSON-RPC errors travel inside a 200 by spec, but for the validation /
// transport errors that an MCP client should retry against we surface
// real HTTP status codes so generic HTTP clients (curl, k6, monitors) see
// the same semantics. Tool-call errors stay inside a 200.
function errorStatusFor(code: number): number {
  if (code === ERR_PARSE) return 400;
  if (code === ERR_INVALID_REQUEST) return 400;
  if (code === ERR_METHOD_NOT_FOUND) return 404;
  if (code === ERR_INVALID_PARAMS) return 400;
  return 500;
}

// Exports for unit tests. The dispatcher is the surface that exercises
// the most logic; exporting it lets tests skip the HTTP layer entirely.
export const __test__ = {
  TOOLS,
  PROTOCOL_VERSION,
  dispatch,
  handleInitialize,
  handleToolsList,
};
