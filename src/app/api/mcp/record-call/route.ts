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
import { z } from "zod";

import { verifyUserAuth } from "@/lib/api/auth";
import { parseBody } from "@/lib/api/parse-body";
import { recordUsage } from "@/lib/mcp/usage";

export const runtime = "nodejs";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

// Permissive numeric handling matches the prior typeof ladder: malformed
// tokenUsed / durationMs degrade to 0 rather than 400ing the metering call.
const RecordCallSchema = z.object({
  // Message attached at the type-check level too so a missing `tool` field
  // (undefined) surfaces as "tool is required" rather than Zod's default
  // "expected string, received undefined". mcp-usage tests pin this string.
  tool: z
    .string({ message: "tool is required" })
    .trim()
    .min(1, "tool is required"),
  tokenUsed: z
    .number()
    .finite()
    .transform((n) => Math.max(0, Math.floor(n)))
    .optional()
    .catch(undefined),
  durationMs: z
    .number()
    .finite()
    .transform((n) => Math.max(0, Math.round(n)))
    .optional()
    .catch(undefined),
  status: z.enum(["ok", "error", "timeout"], {
    message: "status must be one of ok | error | timeout",
  }),
  errorMessage: z
    .string()
    .min(1)
    .transform((s) => s.slice(0, 200))
    .optional(),
});

export async function POST(request: NextRequest) {
  const auth = verifyUserAuth(request);

  // Skip-not-fail when the caller is anonymous. The MCP server calls this
  // endpoint best-effort and never surfaces the response to the end user;
  // returning 401 would just log noise on stdio-based clients that don't
  // have a configured TRENDINGREPO_USER_TOKEN (legacy: STARSCREENER_USER_TOKEN).
  if (auth.kind !== "ok") {
    return NextResponse.json(
      { ok: true as const, skipped: "anonymous" },
      { status: 200, headers: RESPONSE_HEADERS },
    );
  }

  const parsed = await parseBody(request, RecordCallSchema, {
    includeDetails: false,
  });
  if (!parsed.ok) {
    // Re-shape onto the route's no-store headers. Body shape preserved.
    const errBody = await parsed.response.json();
    return NextResponse.json(errBody, {
      status: parsed.response.status,
      headers: RESPONSE_HEADERS,
    });
  }
  const { tool, status } = parsed.data;
  const tokenUsed = parsed.data.tokenUsed ?? 0;
  const durationMs = parsed.data.durationMs ?? 0;
  const errorMessage = parsed.data.errorMessage;

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
