// POST /api/mcp/record-call
//
// Internal endpoint the MCP server posts to after every tool call. The
// MCP middleware hook (mcp/src/server.ts → `withMetering`) sends:
//
//   { tool, tokenUsed, durationMs, status, errorMessage? }
//
// Auth: user-token (`x-user-token` header). We reuse `verifyUserAuth`
// rather than shipping a second token surface. When the header is
// missing / invalid we return 200 with `{ ok: true, skipped: "anonymous" }`
// so the metering layer is fully non-blocking — unattended MCP clients
// without a configured token still work, they just don't get metered.
//
// Validation failures (malformed body, invalid fields) return 400 so the
// MCP server sees the issue in its best-effort `.catch(() => {})` — the
// server never awaits this call, so 400 is only useful in operator-driven
// smoke tests.
//
// Cache-Control: no-store. Every write has side-effects.

import { NextRequest, NextResponse } from "next/server";

import { verifyUserAuth } from "@/lib/api/auth";
import { recordUsage } from "@/lib/mcp/usage";

export const runtime = "nodejs";

interface RecordCallBody {
  tool?: unknown;
  tokenUsed?: unknown;
  durationMs?: unknown;
  status?: unknown;
  errorMessage?: unknown;
}

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: NextRequest) {
  const auth = verifyUserAuth(request);

  // Skip-not-fail when the caller is anonymous. The MCP server calls this
  // endpoint best-effort and never surfaces the response to the end user;
  // returning 401 would just log noise on stdio-based clients that don't
  // have a configured STARSCREENER_USER_TOKEN.
  if (auth.kind !== "ok") {
    return NextResponse.json(
      { ok: true as const, skipped: "anonymous" },
      { status: 200, headers: RESPONSE_HEADERS },
    );
  }

  let body: RecordCallBody;
  try {
    const parsed = (await request.json()) as unknown;
    if (!isRecord(parsed)) {
      return NextResponse.json(
        { ok: false as const, error: "body must be a JSON object" },
        { status: 400, headers: RESPONSE_HEADERS },
      );
    }
    body = parsed as RecordCallBody;
  } catch {
    return NextResponse.json(
      { ok: false as const, error: "invalid JSON body" },
      { status: 400, headers: RESPONSE_HEADERS },
    );
  }

  const tool = typeof body.tool === "string" ? body.tool.trim() : "";
  if (tool.length === 0) {
    return NextResponse.json(
      { ok: false as const, error: "tool is required" },
      { status: 400, headers: RESPONSE_HEADERS },
    );
  }

  const tokenUsed =
    typeof body.tokenUsed === "number" && Number.isFinite(body.tokenUsed)
      ? Math.max(0, Math.floor(body.tokenUsed))
      : 0;

  const durationMs =
    typeof body.durationMs === "number" && Number.isFinite(body.durationMs)
      ? Math.max(0, Math.round(body.durationMs))
      : 0;

  const status =
    body.status === "ok" ||
    body.status === "error" ||
    body.status === "timeout"
      ? body.status
      : null;
  if (status === null) {
    return NextResponse.json(
      {
        ok: false as const,
        error: "status must be one of ok | error | timeout",
      },
      { status: 400, headers: RESPONSE_HEADERS },
    );
  }

  const errorMessage =
    typeof body.errorMessage === "string" && body.errorMessage.length > 0
      ? body.errorMessage.slice(0, 200)
      : undefined;

  try {
    await recordUsage({
      userId: auth.userId,
      tool,
      method: "tools/call",
      tokenUsed,
      durationMs,
      status,
      ...(errorMessage !== undefined ? { errorMessage } : {}),
    });
    return NextResponse.json(
      { ok: true as const },
      { status: 200, headers: RESPONSE_HEADERS },
    );
  } catch (err) {
    // `recordUsage` swallows I/O errors internally — a throw here means a
    // validation failure from buildRecord. Surface as 400 so operators can
    // see it.
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false as const, error: message },
      { status: 400, headers: RESPONSE_HEADERS },
    );
  }
}
