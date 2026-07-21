// GET /api/admin/x-engagement
//
// Operator review surface for the X engagement engine. Returns the most recent
// engagement attempts (drafted + posted + notable skips) newest-first,
// INCLUDING the target author, target post URL, our composed reply text, the
// outcome status, and timestamps — so reply quality can be judged from dry-run
// drafts BEFORE arming live posting. Mirrors /api/admin/twitter-outbound.
//
// Auth: ADMIN_TOKEN via verifyAdminAuth. Read-only; Cache-Control: no-store.

import { NextRequest, NextResponse } from "next/server";

import { adminAuthFailureResponse, verifyAdminAuth } from "@/lib/api/auth";
import { listEngagementRuns } from "@/lib/twitter/engagement/audit";
import type { EngagementRecord } from "@/lib/twitter/engagement/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

interface AdminEngagementResponse {
  ok: true;
  count: number;
  records: EngagementRecord[];
}

interface AdminEngagementErrorResponse {
  ok: false;
  error: string;
}

async function handle(
  request: NextRequest,
): Promise<
  NextResponse<AdminEngagementResponse | AdminEngagementErrorResponse>
> {
  const deny = adminAuthFailureResponse(verifyAdminAuth(request));
  if (deny) return deny as NextResponse<AdminEngagementErrorResponse>;

  const rawLimit = request.nextUrl.searchParams.get("limit");
  const parsed = rawLimit ? Number.parseInt(rawLimit, 10) : DEFAULT_LIMIT;
  const limit = Number.isFinite(parsed)
    ? Math.min(Math.max(parsed, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  try {
    const records = await listEngagementRuns(limit);
    return NextResponse.json(
      { ok: true, count: records.length, records },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const GET = handle;
