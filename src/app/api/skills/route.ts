// Public read endpoint for the trending-skill leaderboard the worker
// publishes to ss:data:v1:trending-skill. 6h cron => 12h staleness budget
// covers one missed tick (worker restart, network blip) before we 503.
//
// Mirrors the shape of /api/worker/pulse so the frontend can poll both
// endpoints with the same client code.

import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SkillsPayload {
  fetchedAt: string;
  windowItems: number;
  sources: {
    githubTotalSeen: number;
    topics: string[];
  };
  items: Array<{
    rank: number;
    full_name: string;
    slug: string;
    title: string;
    description: string;
    url: string;
    author: string;
    avatar_url: string;
    language: string | null;
    topics: string[];
    stars: number;
    forks: number;
    pushed_at: string;
    created_at: string;
    source_topics: string[];
    score: number;
  }>;
}

const STALE_AFTER_SECONDS = 12 * 3600;
const TOP_PREVIEW = 10;

export async function GET() {
  const store = getDataStore();
  const result = await store.read<SkillsPayload>("trending-skill");

  if (!result.data) {
    return NextResponse.json(
      {
        ok: false,
        source: result.source,
        message: "trending-skill key not found in any data-store tier",
      },
      { status: 503 },
    );
  }

  const ageSeconds = Math.round(result.ageMs / 1000);
  const stale = ageSeconds > STALE_AFTER_SECONDS;

  return NextResponse.json(
    {
      ok: !stale,
      source: result.source,
      fresh: result.fresh,
      writtenAt: result.writtenAt ?? null,
      ageSeconds,
      items: result.data.windowItems,
      sources: result.data.sources,
      top: result.data.items.slice(0, TOP_PREVIEW).map((s) => ({
        rank: s.rank,
        full_name: s.full_name,
        title: s.title,
        url: s.url,
        author: s.author,
        stars: s.stars,
        score: s.score,
        source_topics: s.source_topics,
      })),
    },
    { status: stale ? 503 : 200 },
  );
}
