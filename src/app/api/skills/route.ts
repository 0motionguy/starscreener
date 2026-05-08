// GET /api/skills
// Public read endpoint for the same five-source skills board rendered by /skills.

import { NextResponse, type NextRequest } from "next/server";

import { READ_MEDIUM_HEADERS } from "@/lib/api/cache";
import { getSkillsSignalData } from "@/lib/ecosystem-leaderboards";
import { rankSkillItems } from "@/lib/skill-ranking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STALE_AFTER_SECONDS = 12 * 3600;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

function parseLimit(request: NextRequest, total: number): number {
  const raw = request.nextUrl.searchParams.get("limit");
  if (!raw) return Math.min(DEFAULT_LIMIT, total);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return Math.min(DEFAULT_LIMIT, total);
  return Math.min(parsed, total, MAX_LIMIT);
}

export async function GET(request: NextRequest) {
  const data = await getSkillsSignalData();
  const items = rankSkillItems(data.combined.items);

  if (items.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        source: data.source,
        message: "No skills rows found across skills.sh, GitHub, skillsmp, lobehub, or smithery.",
      },
      { status: 503, headers: READ_MEDIUM_HEADERS },
    );
  }

  const ageSeconds = Math.round(data.ageMs / 1000);
  const stale = ageSeconds > STALE_AFTER_SECONDS;
  const limit = parseLimit(request, items.length);
  const rows = items.slice(0, limit).map((s, index) => ({
    rank: index + 1,
    id: s.id,
    title: s.title,
    url: s.url,
    author: s.author,
    linkedRepo: s.linkedRepo,
    sourceLabel: s.sourceLabel,
    sourceTrendRank: s.sourceTrendRank ?? null,
    sourceTrendScore: s.sourceTrendScore ?? null,
    sourceVelocity: s.sourceVelocity ?? null,
    signalScore: s.signalScore,
    hotness: s.hotness ?? null,
    popularity: s.popularity,
    popularityLabel: s.popularityLabel,
    derivativeRepoCount: s.derivativeRepoCount ?? 0,
    lastPushedAt: s.lastPushedAt ?? null,
    createdAt: s.createdAt ?? null,
    tags: s.tags,
  }));

  return NextResponse.json(
    {
      ok: !stale,
      source: data.source,
      fetchedAt: data.combined.fetchedAt,
      ageSeconds,
      total: items.length,
      returned: rows.length,
      sources: {
        skillsSh: data.skillsSh.items.length,
        github: data.github.items.length,
        skillsmp: data.combined.meta.skillsmp ?? null,
        lobehub: data.combined.meta.lobehub ?? null,
        smithery: data.combined.meta.smithery ?? null,
        totalSeen: data.combined.meta.total ?? null,
      },
      rankedBy:
        "source-published trend score, source rank, pipeline signal, hotness movement, cross-source agreement, derivative citations",
      top: rows.slice(0, 10),
      items: rows,
    },
    { status: stale ? 503 : 200, headers: READ_MEDIUM_HEADERS },
  );
}
