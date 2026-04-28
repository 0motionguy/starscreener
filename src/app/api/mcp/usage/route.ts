// GET /api/mcp/usage?month=YYYY-MM
//
// User-facing report of MCP tool-call usage for the authenticated caller.
// Auth: session cookie (ss_user) OR user-token (x-user-token / Bearer).
//
// Query params:
//   month=YYYY-MM   — defaults to the current UTC month.
//
// Response (200):
//   {
//     ok: true,
//     month,
//     summary: { totalCalls, byTool, byDay, errors, totalDurationMs },
//     records: UsageRecord[]   // present ONLY when the caller has the
//                              // "mcp.usage-reports" entitlement; free-tier
//                              // callers get summary + `records: null`
//                              // with a `gatedReason` hint. Capped at 1000.
//   }
//
// Cache-Control: `private, s-maxage=60, stale-while-revalidate=300` — the
// report is per-user, so the `private` modifier keeps shared caches (CDN)
// from cross-serving rows between users.

import { NextRequest, NextResponse } from "next/server";

import { userAuthFailureResponse, verifyUserAuth } from "@/lib/api/auth";
import { canUseFeature } from "@/lib/mcp/entitlements";
import {
  listUsageForUser,
  summarizeUsage,
  type UsageRecord,
  type UsageSummary,
} from "@/lib/mcp/usage";

export const runtime = "nodejs";

const MAX_RECORDS = 1000;

const RESPONSE_HEADERS = {
  "Cache-Control": "private, s-maxage=60, stale-while-revalidate=300",
} as const;

interface UsageSuccessResponse {
  ok: true;
  month: string;
  summary: UsageSummary;
  records: UsageRecord[] | null;
  gatedReason?: string;
}

interface UsageErrorResponse {
  ok: false;
  error: string;
  code?: string;
}

/** Current month in UTC as "YYYY-MM". */
function currentMonth(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function isValidMonth(month: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<UsageSuccessResponse | UsageErrorResponse>> {
  const auth = verifyUserAuth(request);
  const deny = userAuthFailureResponse(auth);
  if (deny) return deny as NextResponse<UsageErrorResponse>;
  if (auth.kind !== "ok") {
    return NextResponse.json(
      { ok: false, error: "unauthorized", code: "UNAUTHORIZED" },
      { status: 401, headers: RESPONSE_HEADERS },
    );
  }
  const { userId } = auth;

  const url = new URL(request.url);
  const rawMonth = url.searchParams.get("month");
  const month = rawMonth ?? currentMonth();
  if (!isValidMonth(month)) {
    return NextResponse.json(
      { ok: false, error: "month must look like YYYY-MM", code: "BAD_QUERY" },
      { status: 400, headers: RESPONSE_HEADERS },
    );
  }

  try {
    const summary = await summarizeUsage(userId, { month });

    const hasFullAccess = canUseFeature(userId, "mcp.usage-reports");
    if (!hasFullAccess) {
      return NextResponse.json(
        {
          ok: true,
          month,
          summary,
          records: null,
          gatedReason:
            "mcp.usage-reports entitlement required for per-call records — upgrade to Team tier",
        },
        { headers: RESPONSE_HEADERS },
      );
    }

    const allRecords = await listUsageForUser(userId, { month });
    // Newest first, capped.
    allRecords.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    const records = allRecords.slice(0, MAX_RECORDS);

    return NextResponse.json(
      { ok: true, month, summary, records },
      { headers: RESPONSE_HEADERS },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api:mcp:usage] report failed", err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: RESPONSE_HEADERS },
    );
  }
}
