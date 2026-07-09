// GET /api/admin/twitter-outbound
//
// Operator review surface for the outbound X posting pipeline. Returns
// the most recent outbound runs (daily threads, weekly recaps, idea
// posts) newest-first, INCLUDING the full composed post texts + URLs —
// so selection quality can be judged from console/null-mode dry runs
// before real publishing is switched on.
//
// Auth: ADMIN_TOKEN via verifyAdminAuth. Read-only; Cache-Control:
// no-store.

import { NextRequest, NextResponse } from "next/server";

import { adminAuthFailureResponse, verifyAdminAuth } from "@/lib/api/auth";
import { listOutboundRuns } from "@/lib/twitter/outbound/audit";
import type { OutboundRunRecord } from "@/lib/twitter/outbound/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

interface AdminOutboundResponse {
  ok: true;
  count: number;
  runs: OutboundRunRecord[];
}

interface AdminOutboundErrorResponse {
  ok: false;
  error: string;
}

async function handle(
  request: NextRequest,
): Promise<NextResponse<AdminOutboundResponse | AdminOutboundErrorResponse>> {
  const deny = adminAuthFailureResponse(verifyAdminAuth(request));
  if (deny) return deny as NextResponse<AdminOutboundErrorResponse>;

  const rawLimit = request.nextUrl.searchParams.get("limit");
  const parsed = rawLimit ? Number.parseInt(rawLimit, 10) : DEFAULT_LIMIT;
  const limit = Number.isFinite(parsed)
    ? Math.min(Math.max(parsed, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  try {
    // listOutboundRuns already sorts newest-first.
    const runs = (await listOutboundRuns()).slice(0, limit);
    return NextResponse.json(
      { ok: true, count: runs.length, runs },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

export const GET = handle;
