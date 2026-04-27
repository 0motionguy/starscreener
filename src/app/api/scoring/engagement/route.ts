// GET /api/scoring/engagement?limit=N
//
// Returns the latest 0-100 engagement composite leaderboard from
// ss:data:v1:engagement-composite. The composite is recomputed hourly
// at :45 by the worker (apps/trendingrepo-worker/src/fetchers/
// engagement-composite). A 6-hour staleness budget classifies the
// payload as dead — under normal operation it should never be older
// than ~75 minutes (cron + a missed tick).
//
// Query params:
//   limit  default 50, max 200 (matches the worker's TOP_LIMIT cap).

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getEngagementCompositeItems,
  getEngagementCompositeMeta,
  refreshEngagementCompositeFromStore,
  type EngagementCompositeItem,
} from "@/lib/engagement-composite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
// 6 hours — composite is hourly so >6h means at least 5 missed ticks,
// which is unambiguously a dead fetcher.
const STALE_AFTER_SECONDS = 6 * 60 * 60;

interface SuccessBody {
  ok: true;
  source: "redis" | "file" | "memory";
  writtenAt: string | null;
  ageSeconds: number;
  count: number;
  cohortSize: number;
  items: EngagementCompositeItem[];
}

interface FailureBody {
  ok: false;
  source: "missing";
  message: string;
}

function parseLimit(raw: string | null): number {
  if (raw === null) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, parsed));
}

export async function GET(req: NextRequest): Promise<NextResponse<SuccessBody | FailureBody>> {
  await refreshEngagementCompositeFromStore();
  const meta = getEngagementCompositeMeta();

  if (meta.source === "missing" || meta.itemCount === 0) {
    return NextResponse.json(
      {
        ok: false,
        source: "missing",
        message:
          "engagement-composite payload not found in any data-store tier — fetcher may be cold or the worker is dead",
      } satisfies FailureBody,
      { status: 503 },
    );
  }

  // 503 for stale-beyond-budget so external monitors can alert.
  if (meta.ageSeconds > STALE_AFTER_SECONDS) {
    return NextResponse.json(
      {
        ok: false,
        source: "missing",
        message: `engagement-composite stale: ${meta.ageSeconds}s old (budget ${STALE_AFTER_SECONDS}s)`,
      } satisfies FailureBody,
      { status: 503 },
    );
  }

  const limit = parseLimit(req.nextUrl.searchParams.get("limit"));
  const items = getEngagementCompositeItems(limit);

  return NextResponse.json(
    {
      ok: true,
      source: meta.source as "redis" | "file" | "memory",
      writtenAt: meta.writtenAt,
      ageSeconds: meta.ageSeconds,
      count: items.length,
      cohortSize: meta.cohortSize,
      items,
    } satisfies SuccessBody,
    {
      status: 200,
      headers: {
        // 60s edge cache — composite is hourly; serving a 1-min-old payload
        // to back-to-back requests is correct and saves a Redis hit.
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    },
  );
}
