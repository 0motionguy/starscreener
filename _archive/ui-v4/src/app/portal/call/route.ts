// POST /portal/call
//
// Portal v0.1 dispatch endpoint. Body shape: { tool: string, params?: object }.
// Returns:
//   200 { ok: true, result }           on success
//   200 { ok: false, error, code }     on handled failures (NOT_FOUND,
//                                        INVALID_PARAMS, INTERNAL)
//   429 { ok: false, error, code: "RATE_LIMITED" } on rate-limit breach
// All responses content-type: application/json; charset=utf-8. CORS echoes
// the request Origin so browser-resident visitors can call the same
// endpoint they discovered via GET /portal.

import { NextRequest, NextResponse } from "next/server";

import { verifyInternalAgentAuth } from "@/lib/api/auth";
import { pipeline } from "@/lib/pipeline/pipeline";
import { dispatchCall } from "@/portal/dispatcher";
import { consumeToken } from "@/portal/rate-limit";

function clientKey(req: NextRequest): string {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey) return `k:${apiKey}`;
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return `ip:${fwd.split(",")[0].trim()}`;
  return "ip:unknown";
}

function corsHeaders(req: NextRequest): HeadersInit {
  const origin = req.headers.get("origin") ?? "*";
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
    "Vary": "Origin",
  };
}

export function OPTIONS(req: NextRequest): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: NextRequest): Promise<Response> {
  const authed = req.headers.get("x-api-key") !== null;
  const gate = consumeToken(clientKey(req), authed);
  if (!gate.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "rate limit exceeded",
        code: "RATE_LIMITED",
      },
      {
        status: 429,
        headers: {
          ...corsHeaders(req),
          "Retry-After": Math.ceil(
            (gate.reset_at_ms - Date.now()) / 1000,
          ).toString(),
        },
      },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "request body must be valid JSON",
        code: "INVALID_PARAMS",
      },
      { status: 200, headers: corsHeaders(req) },
    );
  }

  // Pipeline must be hydrated before tool handlers read from the stores.
  // Idempotent; concurrent calls share one in-flight promise.
  await pipeline.ensureReady();

  // Resolve the caller's auth principal once and thread it into the
  // dispatcher. `principal` is undefined for anonymous read-only calls;
  // write tools throw AuthError when they see no principal.
  const auth = verifyInternalAgentAuth(req);
  const principal = auth.kind === "ok" ? auth.principal : undefined;

  const envelope = await dispatchCall(body, { principal });
  return NextResponse.json(envelope, {
    status: 200,
    headers: corsHeaders(req),
  });
}
