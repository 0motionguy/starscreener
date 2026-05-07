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
// Tools (definitions + handlers in ./_dispatcher):
//   - get_trending(window?, category?, limit?)
//   - get_repo(owner, name)
//   - get_mentions(owner, name, source?, since?, limit?)
//   - search_repos(query, limit?, category?)
//
// Auth: public read. The four tools are the same ones we serve unauth'd
// over the REST API; gating them here would just push every MCP client to
// scrape the public routes.
//
// SAM-06 / AGN-947.

import { NextRequest, NextResponse } from "next/server";

import {
  ERR_INVALID_REQUEST,
  ERR_PARSE,
  PROTOCOL_VERSION,
  SERVER_NAME,
  SERVER_VERSION,
  TOOLS,
  dispatch,
  errorStatusFor,
  rpcError,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from "./_dispatcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
} as const;

// lint-allow: no-parsebody — JSON-RPC 2.0 dispatch; body shape is method-dependent so a single Zod schema doesn't apply. Validation lives per-method in ./_dispatcher.
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
      hint: 'POST a JSON-RPC 2.0 envelope here to invoke tools — try {"jsonrpc":"2.0","id":1,"method":"tools/list"}.',
    },
    { status: 200, headers: RESPONSE_HEADERS },
  );
}
