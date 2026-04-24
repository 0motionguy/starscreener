// POST /api/cron/mcp/rotate-usage
// (GET alias provided for Vercel Cron, which fires GET.)
//
// Rolling 12-month retention cron for `.data/mcp-usage.jsonl`.
//
// Policy: this route TRUNCATES the log to the last 365 days. Rows older
// than `now - 365d` are DROPPED (not archived) in the interest of keeping
// this first cut simple. If operators want historical retention later,
// swap in a gzip-archive step — the `rotateUsage` helper in
// `src/lib/mcp/usage.ts` stays unchanged; only this handler grows.
//
// Auth: CRON_SECRET bearer (same pattern as every other cron route).
//
// Response (200):
//   { ok: true, removed, remaining, durationMs, retentionDays }
//
// Schedule: monthly at 03:00 UTC on the 1st. Duplicated in
// `vercel.json` and `.github/workflows/cron-mcp-usage-rotate.yml`; both
// can run without corruption because `rotateUsage` rewrites under the
// shared per-file lock.

import { NextRequest, NextResponse } from "next/server";

import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import { rotateUsage } from "@/lib/mcp/usage";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

/** 365 days in milliseconds. Matches the route-header policy doc. */
const RETENTION_DAYS = 365;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny;

  const started = Date.now();
  try {
    const { removed, remaining } = await rotateUsage({
      retentionMs: RETENTION_MS,
    });
    return NextResponse.json(
      {
        ok: true as const,
        removed,
        remaining,
        retentionDays: RETENTION_DAYS,
        durationMs: Date.now() - started,
      },
      { headers: RESPONSE_HEADERS },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api:cron:mcp:rotate-usage] failed", err);
    return NextResponse.json(
      { ok: false as const, error: message, durationMs: Date.now() - started },
      { status: 500, headers: RESPONSE_HEADERS },
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
