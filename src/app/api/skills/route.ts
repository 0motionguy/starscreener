// Public read endpoint for skills leaderboards.
//
// Default response is the legacy `trending-skill` shape so existing API
// consumers keep working. Use `?v=2` or `?shape=combined` for the same
// combined multi-source board used by /skills.

import { NextRequest, NextResponse } from "next/server";
import { getSkillsSignalData } from "@/lib/ecosystem-leaderboards";
import { getDataStore } from "@/lib/data-store";
import { READ_MEDIUM_HEADERS } from "@/lib/api/cache";

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

const LEGACY_STALE_AFTER_SECONDS = 12 * 3600;
const COMBINED_STALE_AFTER_SECONDS = 36 * 3600;
const TOP_PREVIEW = 10;
const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = MAX_LIMIT;

export async function GET(request: NextRequest) {
  const version = request.nextUrl.searchParams.get("v");
  const shape = request.nextUrl.searchParams.get("shape");
  if (version === "2" || shape === "combined") {
    return getCombinedSkills(request);
  }
  return getLegacySkills();
}

async function getLegacySkills() {
  const store = getDataStore();
  const result = await store.read<SkillsPayload>("trending-skill");

  if (!result.data) {
    return NextResponse.json(
      {
        ok: false,
        source: result.source,
        message: "trending-skill key not found in any data-store tier",
      },
      { status: 503, headers: READ_MEDIUM_HEADERS },
    );
  }

  const ageSeconds = Math.round(result.ageMs / 1000);
  const stale = ageSeconds > LEGACY_STALE_AFTER_SECONDS;

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
    { status: stale ? 503 : 200, headers: READ_MEDIUM_HEADERS },
  );
}

async function getCombinedSkills(request: NextRequest) {
  const limitParam = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(limitParam)))
    : DEFAULT_LIMIT;
  const data = await getSkillsSignalData();
  const ageSeconds = Math.round(data.ageMs / 1000);
  const stale = ageSeconds > COMBINED_STALE_AFTER_SECONDS;

  return NextResponse.json(
    {
      ok: !stale,
      source: data.source,
      writtenAt: data.fetchedAt,
      ageSeconds,
      total: data.combined.items.length,
      returned: Math.min(limit, data.combined.items.length),
      sources: data.combined.meta,
      items: data.combined.items.slice(0, limit).map((item) => ({
        rank: item.rank,
        id: item.id,
        title: item.title,
        url: item.url,
        author: item.author,
        linkedRepo: item.linkedRepo,
        source: item.primaryRankSource ?? item.sourceLabel,
        sourceRanks: item.sourceRanks ?? [],
        metricLabel: item.sourceMetricLabel ?? item.popularityLabel,
        metricValue: item.sourceMetricValue ?? item.popularity,
        cited: item.derivativeRepoCount ?? 0,
        signalScore: item.signalScore,
      })),
    },
    { status: stale ? 503 : 200, headers: READ_MEDIUM_HEADERS },
  );
}
