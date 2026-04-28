// GET /api/health/portal
//
// Liveness probe for the Portal integration. Returns 200 only when the
// in-process manifest validates against the v0.1 schema. Designed for
// CI to call against a Vercel preview URL after deploy so a schema drift
// blocks the promote.

import { NextRequest, NextResponse } from "next/server";

import { readEnv } from "@/lib/env-helpers";
import { buildManifest } from "@/portal/manifest";
import { validateManifest } from "@/portal/validate";

export const runtime = "nodejs";

interface HealthBody {
  ok: boolean;
  manifest_valid: boolean;
  portal_version: string;
  tool_count: number;
  errors?: string[];
}

export function GET(req: NextRequest): Response {
  const envBase =
    readEnv("TRENDINGREPO_PUBLIC_URL", "STARSCREENER_PUBLIC_URL") ??
    process.env.NEXT_PUBLIC_SITE_URL;
  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const base = envBase ?? (host ? `${proto}://${host}` : "http://localhost:3023");

  const manifest = buildManifest(base);
  const check = validateManifest(manifest);
  const body: HealthBody = {
    ok: check.ok,
    manifest_valid: check.ok,
    portal_version: manifest.portal_version,
    tool_count: manifest.tools.length,
    ...(check.ok ? {} : { errors: check.errors }),
  };
  return NextResponse.json(body, { status: check.ok ? 200 : 503 });
}
