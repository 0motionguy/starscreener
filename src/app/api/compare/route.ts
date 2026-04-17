import { NextRequest, NextResponse } from "next/server";
import { pipeline } from "@/lib/pipeline/pipeline";
import { slugToId } from "@/lib/utils";
import type { CompareRepoData } from "@/lib/types";

export async function GET(request: NextRequest) {
  await pipeline.ensureReady();
  const { searchParams } = request.nextUrl;
  const reposParam = searchParams.get("repos") ?? "";

  if (!reposParam.trim()) {
    return NextResponse.json(
      { error: "Missing required 'repos' parameter" },
      { status: 400 },
    );
  }

  const rawIds = reposParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (rawIds.length < 2) {
    return NextResponse.json(
      { error: "At least 2 repos are required for comparison" },
      { status: 400 },
    );
  }

  if (rawIds.length > 5) {
    return NextResponse.json(
      { error: "Maximum 5 repos can be compared at once" },
      { status: 400 },
    );
  }

  // Accept either "owner/name" or "owner--name" forms. The compare pipeline
  // operates on repo IDs (owner--name), so normalize up front.
  const repoIds = rawIds.map((id) => (id.includes("/") ? slugToId(id) : id));

  const result = pipeline.getRepoCompare(repoIds);

  // Detect any IDs the pipeline couldn't resolve — keeps the 404 behavior
  // the existing UI relies on.
  const resolvedIds = new Set(result.repos.map((m) => m.repo.id));
  const notFound = repoIds.filter((id) => !resolvedIds.has(id));
  if (notFound.length > 0) {
    return NextResponse.json(
      { error: `Repos not found: ${notFound.join(", ")}` },
      { status: 404 },
    );
  }

  if (result.repos.length < 2) {
    return NextResponse.json(
      { error: "At least 2 valid repos are required for comparison" },
      { status: 400 },
    );
  }

  // Adapt the pipeline's CompareResult to the UI's CompareRepoData shape.
  const repos: CompareRepoData[] = result.repos.map((m) => ({
    repo: m.repo,
    starHistory: m.starHistory,
    forkHistory: m.forkHistory,
  }));

  return NextResponse.json({
    repos,
    winner: {
      momentum: result.winners.momentum,
      stars: result.winners.stars,
      // UI expects `growth`; pipeline exposes `growth7d`. Rename here.
      growth: result.winners.growth7d,
    },
  });
}
