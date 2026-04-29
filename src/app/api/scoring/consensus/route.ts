// GET /api/scoring/consensus?limit=N
//
// Returns the latest consensus trending leaderboard. The worker fuses
// STARSCREENER's engagement-composite with OSS Insight and Trendshift daily
// rankings, then publishes the result to ss:data:v1:consensus-trending.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getConsensusTrendingItems,
  getConsensusTrendingMeta,
  refreshConsensusTrendingFromStore,
  type ConsensusItem,
} from "@/lib/consensus-trending";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const STALE_AFTER_SECONDS = 6 * 60 * 60;

interface SuccessBody {
  ok: true;
  source: "redis" | "file" | "memory" | "missing";
  writtenAt: string | null;
  ageSeconds: number;
  count: number;
  items: ConsensusItem[];
  degraded?: boolean;
  message?: string;
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
  await refreshConsensusTrendingFromStore();
  const meta = getConsensusTrendingMeta();
  const limit = parseLimit(req.nextUrl.searchParams.get("limit"));

  if (meta.source === "missing" || meta.itemCount === 0) {
    return NextResponse.json(
      {
        ok: true,
        source: "missing",
        writtenAt: null,
        ageSeconds: 0,
        count: 0,
        items: [],
        degraded: true,
        message: "consensus-trending payload is warming",
      } satisfies SuccessBody,
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      },
    );
  }

  if (meta.ageSeconds > STALE_AFTER_SECONDS) {
    return NextResponse.json(
      {
        ok: false,
        source: "missing",
        message: `consensus-trending stale: ${meta.ageSeconds}s old (budget ${STALE_AFTER_SECONDS}s)`,
      } satisfies FailureBody,
      { status: 503 },
    );
  }

  const items = getConsensusTrendingItems(limit);
  return NextResponse.json(
    {
      ok: true,
      source: meta.source as "redis" | "file" | "memory",
      writtenAt: meta.writtenAt,
      ageSeconds: meta.ageSeconds,
      count: items.length,
      items,
    } satisfies SuccessBody,
    {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    },
  );
}
