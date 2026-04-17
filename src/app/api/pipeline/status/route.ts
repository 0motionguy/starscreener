// GET /api/pipeline/status
//
// Health/status endpoint for the pipeline. Reports how much data is
// currently loaded, when the last refresh happened, and the current GitHub
// rate-limit budget (null in the mock-adapter path).

import { NextResponse } from "next/server";
import { pipeline, repoStore, scoreStore, snapshotStore } from "@/lib/pipeline/pipeline";
import { createGitHubAdapter } from "@/lib/pipeline/ingestion/ingest";

export interface PipelineStatusResponse {
  seeded: boolean;
  repoCount: number;
  snapshotCount: number;
  scoreCount: number;
  lastRefreshAt: string | null;
  rateLimitRemaining: number | null;
  stats: {
    totalRepos: number;
    totalStars: number;
    hotCount: number;
    breakoutCount: number;
    lastRefreshAt: string | null;
  };
}

export async function GET(): Promise<NextResponse<PipelineStatusResponse | { error: string }>> {
  try {
    // Hydrate persisted state from disk (or fall back to mock seed) before
    // any reads so the status endpoint reflects the durable snapshot.
    await pipeline.ensureReady();

    const stats = pipeline.getGlobalStats();

    // Sum snapshots across repos — snapshot store is keyed by repoId so we
    // walk the repo list to count.
    const repos = repoStore.getAll();
    let snapshotCount = 0;
    for (const repo of repos) {
      snapshotCount += snapshotStore.list(repo.id).length;
    }

    // Rate limit: query the current adapter (mock returns null).
    let rateLimitRemaining: number | null = null;
    try {
      const adapter = createGitHubAdapter();
      const rl = await adapter.getRateLimit();
      rateLimitRemaining = rl?.remaining ?? null;
    } catch {
      rateLimitRemaining = null;
    }

    const body: PipelineStatusResponse = {
      seeded: repos.length > 0,
      repoCount: repos.length,
      snapshotCount,
      scoreCount: scoreStore.getAll().length,
      lastRefreshAt: stats.lastRefreshAt,
      rateLimitRemaining,
      stats: {
        totalRepos: stats.totalRepos,
        totalStars: stats.totalStars,
        hotCount: stats.hotCount,
        breakoutCount: stats.breakoutCount,
        lastRefreshAt: stats.lastRefreshAt,
      },
    };

    return NextResponse.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
