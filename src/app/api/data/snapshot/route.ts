import { NextRequest, NextResponse } from "next/server";

import { authenticateDataApi, DATA_API_HEADERS } from "@/lib/api/data-route";
import { buildDataSnapshotResponse } from "@/lib/api/data-api";
import { getDerivedRepos } from "@/lib/derived-repos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseTopLimit(request: NextRequest): number {
  const raw = new URL(request.url).searchParams.get("top");
  if (raw === null || raw.trim() === "") return 25;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return 25;
  return Math.min(Math.floor(parsed), 100);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateDataApi(request);
  if (!auth.ok) return auth.response;

  const response = buildDataSnapshotResponse({
    repos: getDerivedRepos(),
    topLimit: parseTopLimit(request),
  });

  return NextResponse.json(response, {
    headers: {
      ...DATA_API_HEADERS,
      ...auth.context.rateLimitHeaders,
      "X-Starscreener-User": auth.context.userId,
      "X-Starscreener-Tier": auth.context.tier,
    },
  });
}
