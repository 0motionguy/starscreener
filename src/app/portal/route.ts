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
import { getClientIp } from "@/lib/api/client-ip";
import { normalizeHttpOrigin } from "@/lib/security/trusted-url";
import { buildManifest } from "@/portal/manifest";
import { consumeToken } from "@/portal/rate-limit";
import { validateManifest } from "@/portal/validate";

const DEV_ALLOWED_ORIGINS = ["http://localhost:3023", "http://127.0.0.1:3023"];

function clientKey(req: NextRequest): string {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey) return `k:${apiKey}`;
  return `ip:${getClientIp(req)}`;
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

function getAllowedOrigins(): Set<string> {
  const values = [
    process.env.TRENDINGREPO_PUBLIC_URL,
    process.env.STARSCREENER_PUBLIC_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.PORTAL_CORS_ALLOWED_ORIGINS,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .flatMap((value) => value.split(","))
    .map((value) => normalizeHttpOrigin(value))
    .filter((value): value is string => value !== null);

  if (process.env.NODE_ENV !== "production") {
    for (const fallback of DEV_ALLOWED_ORIGINS) {
      const normalized = normalizeHttpOrigin(fallback);
      if (normalized) values.push(normalized);
    }
  }

  return new Set(values);
}

function requestOrigin(req: NextRequest): string | null {
  const value = req.headers.get("origin");
  if (!value) return null;
  return normalizeHttpOrigin(value);
}

function isOriginAllowed(req: NextRequest): boolean {
  const origin = requestOrigin(req);
  if (!origin) return false;
  return getAllowedOrigins().has(origin);
}

function hasDisallowedOrigin(req: NextRequest): boolean {
  const origin = requestOrigin(req);
  if (!origin) return false;
  return !getAllowedOrigins().has(origin);
}

function baseHeaders(req: NextRequest): HeadersInit {
  const origin = requestOrigin(req);
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
    "Cache-Control": "public, max-age=60",
    "X-Portal-Version": "0.1",
    "Vary": "Origin",
    ...(origin && isOriginAllowed(req)
      ? { "Access-Control-Allow-Origin": origin }
      : {}),
  };
}

export function OPTIONS(req: NextRequest): Response {
  if (hasDisallowedOrigin(req)) {
    return NextResponse.json(
      { ok: false, error: "origin not allowed", code: "CORS_DENIED" },
      { status: 403, headers: baseHeaders(req) },
    );
  }
  return new Response(null, { status: 204, headers: baseHeaders(req) });
}

export function GET(req: NextRequest): Response {
  if (hasDisallowedOrigin(req)) {
    return NextResponse.json(
      { ok: false, error: "origin not allowed", code: "CORS_DENIED" },
      { status: 403, headers: baseHeaders(req) },
    );
  }

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
          ...baseHeaders(req),
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
      { status: 500, headers: baseHeaders(req) },
    );
  }

  return NextResponse.json(manifest, { headers: baseHeaders(req) });
}
