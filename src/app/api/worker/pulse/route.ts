// Worker liveness probe — reads ss:data:v1:hn-pulse and reports freshness.
// A green response (HTTP 200, ok=true) means the croner scheduler ->
// runFetcher -> writeDataStore -> data-store path is alive on Railway.
// Used by the Phase A6 verification gate and ongoing operator monitoring.

import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface HnPulsePayload {
  fetchedAt: string;
  source: "hacker-news";
  windowItems: number;
  stories: Array<{
    id: number;
    rank: number;
    title: string;
    url: string | null;
    score: number;
    comments: number;
    by: string;
    createdAt: string;
  }>;
}

// hn-pulse runs every 10 min on the worker. 30 min budget covers 2 missed
// ticks (Railway restart, network blip) before we declare the worker dead.
const STALE_AFTER_SECONDS = 30 * 60;

export async function GET() {
  const store = getDataStore();
  const result = await store.read<HnPulsePayload>("hn-pulse");

  if (!result.data) {
    return NextResponse.json(
      {
        ok: false,
        source: result.source,
        message: "hn-pulse key not found in any data-store tier",
      },
      { status: 503 },
    );
  }

  const ageSeconds = Math.round(result.ageMs / 1000);
  const stale = ageSeconds > STALE_AFTER_SECONDS;
  const redisFresh = result.source === "redis" && result.fresh === true;
  const hasStories =
    result.data.windowItems > 0 && Array.isArray(result.data.stories) && result.data.stories.length > 0;
  const ok = !stale && redisFresh && hasStories;

  return NextResponse.json(
    {
      ok,
      source: result.source,
      fresh: result.fresh,
      writtenAt: result.writtenAt ?? null,
      ageSeconds,
      stale,
      stories: result.data.windowItems,
      sample: result.data.stories.slice(0, 3).map((s) => ({
        id: s.id,
        rank: s.rank,
        title: s.title,
        score: s.score,
      })),
    },
    { status: ok ? 200 : 503 },
  );
}
