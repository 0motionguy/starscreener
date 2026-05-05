// GET /api/health/cron-activity
//
// Phase 2 P-119 (F-OBSV-001). Returns the in-memory cron ring buffer so
// an external uptime monitor can alert on "cron hasn't fired in X minutes"
// without having to parse Vercel logs.
//
// Query params:
//   limit   — max entries to return, newest-first (default: full buffer)
//   scope   — filter to a specific scope (e.g. "cron:ingest")
//   since   — ISO timestamp, return only entries at-or-newer
//   window  — also emit a summary for the last N ms (default 3_600_000 = 1h)
//
// The summary field is designed to be the alert surface:
//   summary.ageMs === null      → never fired since this process started
//   summary.ageMs > cadence*2   → cron is missing scheduled fires
//   summary.failed > 0          → recent fires errored
//
// No auth on this endpoint: it surfaces status, not content. Safe to make
// public the same way /api/health is.

import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth, verifyCronAuth } from "@/lib/api/auth";
import {
  getCronActivity,
  summarizeCronActivity,
  type CronActivityEntry,
  type CronActivitySummary,
} from "@/lib/observability/cron-activity";

export const runtime = "nodejs";

interface CronActivityResponse {
  entries: CronActivityEntry[];
  summary: CronActivitySummary;
}

type PublicCronActivityResponse = Pick<CronActivityResponse, "summary">;

const DEFAULT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export async function GET(
  request: NextRequest,
): Promise<NextResponse<CronActivityResponse | PublicCronActivityResponse>> {
  const wantsDetail = request.nextUrl.searchParams.get("detail") === "1";
  const cronSecret = process.env.CRON_SECRET?.trim();
  const includeDetail =
    wantsDetail &&
    ((cronSecret ? verifyCronAuth(request).kind === "ok" : false) ||
      verifyAdminAuth(request).kind === "ok");
  const params = request.nextUrl.searchParams;

  const limitStr = params.get("limit");
  const limit =
    limitStr !== null
      ? Math.max(0, Math.min(500, Number(limitStr) || 0))
      : undefined;
  const scope = params.get("scope") ?? undefined;
  const since = params.get("since") ?? undefined;

  const windowStr = params.get("window");
  const windowMs =
    windowStr !== null
      ? Math.max(60_000, Math.min(86_400_000, Number(windowStr) || DEFAULT_WINDOW_MS))
      : DEFAULT_WINDOW_MS;

  const entries = getCronActivity({ limit, scope, since });
  const summary = summarizeCronActivity(windowMs, scope);

  if (!includeDetail) {
    return NextResponse.json({ summary });
  }
  return NextResponse.json({ entries, summary });
}
