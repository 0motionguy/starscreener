import { NextRequest, NextResponse } from "next/server";
import {
  getTwitterLeaderboard,
  getTwitterOverviewStats,
  getTwitterTrendingRepoLeaderboard,
} from "@/lib/twitter/service";
import { READ_CACHE_HEADERS } from "@/lib/api/cache";
import { checkRateLimit } from "@/lib/api/rate-limit";

type TwitterLeaderboardMode = "trending" | "global";

function parseMode(value: string | null): TwitterLeaderboardMode | null {
  if (value === null || value === "" || value === "trending") return "trending";
  if (value === "global" || value === "x") return "global";
  return null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 25;
  const mode = parseMode(request.nextUrl.searchParams.get("mode"));

  if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return NextResponse.json(
      { error: "limit must be an integer between 1 and 100" },
      { status: 400 },
    );
  }

  if (!mode) {
    return NextResponse.json(
      { error: "mode must be one of: trending, global" },
      { status: 400 },
    );
  }

  const rateLimit = checkRateLimit(request, { windowMs: 60_000, maxRequests: 60 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "rate limit exceeded" },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": "60",
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000)),
        },
      },
    );
  }

  const [rows, stats] = await Promise.all([
    mode === "global"
      ? getTwitterLeaderboard(limit)
      : getTwitterTrendingRepoLeaderboard(limit),
    getTwitterOverviewStats(),
  ]);

  return NextResponse.json(
    {
      mode,
      rows,
      stats,
      generatedAt: new Date().toISOString(),
    },
    {
      headers: {
        ...READ_CACHE_HEADERS,
        "X-RateLimit-Limit": "60",
        "X-RateLimit-Remaining": String(rateLimit.remaining),
      },
    },
  );
}
