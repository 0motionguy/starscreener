// GET /portal
//
// Portal v0.1 manifest — the public "what can I do here?" discovery
// document. Served root-level (not under /api/) to match the Portal
// convention. CORS: open for GET because the manifest is inherently
// public. Cache: 60s public to let CDNs absorb spikes.
//
// Rate limit: lightweight — manifest reads don't touch the pipeline, so
// they're cheap. We still meter via the same bucket as /portal/call to
// keep a single abuse ceiling.

import { NextRequest, NextResponse } from "next/server";

import { readEnv } from "@/lib/env-helpers";
import { buildManifest } from "@/portal/manifest";
import { consumeToken } from "@/portal/rate-limit";
import { validateManifest } from "@/portal/validate";

function clientKey(req: NextRequest): string {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey) return `k:${apiKey}`;
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return `ip:${fwd.split(",")[0].trim()}`;
  return "ip:unknown";
}

function publicBaseUrl(req: NextRequest): string {
  const envBase =
    readEnv("TRENDINGREPO_PUBLIC_URL", "STARSCREENER_PUBLIC_URL") ??
    process.env.NEXT_PUBLIC_SITE_URL;
  if (envBase) return envBase;
  const host = req.headers.get("host");
  if (host) {
    const proto = req.headers.get("x-forwarded-proto") ?? "http";
    return `${proto}://${host}`;
  }
  return "http://localhost:3023";
}

function baseHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
    "Cache-Control": "public, max-age=60",
    "X-Portal-Version": "0.1",
  };
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: baseHeaders() });
}

export function GET(req: NextRequest): Response {
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
          ...baseHeaders(),
          "Retry-After": Math.ceil(
            (gate.reset_at_ms - Date.now()) / 1000,
          ).toString(),
        },
      },
    );
  }

  const manifest = buildManifest(publicBaseUrl(req));
  const check = validateManifest(manifest);
  if (!check.ok) {
    // Should never happen — manifest.ts validates at module load. Keep
    // the guard anyway so a regression doesn't ship a broken manifest.
    return NextResponse.json(
      {
        ok: false,
        error: `manifest failed v0.1 validation: ${check.errors.join("; ")}`,
        code: "INTERNAL",
      },
      { status: 500, headers: baseHeaders() },
    );
  }

  return NextResponse.json(manifest, { headers: baseHeaders() });
}
