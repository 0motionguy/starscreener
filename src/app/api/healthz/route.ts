// GET /api/healthz
//
// Lightweight liveness probe for the docker-compose healthcheck. Returns
// 200 + minimal JSON. No auth, no DB calls, no freshness checks — those
// belong to /api/health. This endpoint exists so toolbox-trendingrepo-1's
// healthcheck hits a small response instead of rendering the 613KB / page
// every 30s.

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "trendingrepo",
    version: process.env.NEXT_PUBLIC_DEPLOY_VERSION ?? "unknown",
    ts: new Date().toISOString(),
  });
}
