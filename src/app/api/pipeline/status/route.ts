// GET /api/pipeline/status
//
// Status / telemetry endpoint for the pipeline. Reports how much data is
// currently loaded, when the last refresh happened, the current GitHub
// rate-limit budget (null in the mock-adapter path), and — since the Phase 2
// red-team review (F-OBSV-003) — returns HTTP 503 when the pipeline is empty
// or stale, matching the contract /api/health already enforces.
//
// Previously this route always returned 200 on a dead pipeline, which misled
// any uptime monitor keyed on HTTP status. The JSON body shape is unchanged;
// only the status code varies.

import { NextResponse } from "next/server";
import { pipeline, repoStore, scoreStore, snapshotStore } from "@/lib/pipeline/pipeline";
import { createGitHubAdapter } from "@/lib/pipeline/ingestion/ingest";

// Must stay in lockstep with src/app/api/health/route.ts STALE_THRESHOLD_MS.
// See F-OBSV-003. A future P3 patch (`health-constants.ts`) unifies them.
const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;

export interface PipelineStatusResponse {
  seeded: boolean;
  healthy: boolean;
  healthStatus: "ok" | "stale" | "empty";
  ageSeconds: number | null;
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

    // O(1) snapshot count — SnapshotStore maintains a running total across
    // all repos (P-114, F-PERF-001). Previously an N*M walk that scaled
    // with repo count × snapshot-history cap.
    const repos = repoStore.getAll();
    const snapshotCount = snapshotStore.totalCount();

    // Rate limit: query the current adapter (mock returns null).
    let rateLimitRemaining: number | null = null;
    try {
      const adapter = createGitHubAdapter();
      const rl = await adapter.getRateLimit();
      rateLimitRemaining = rl?.remaining ?? null;
    } catch {
      rateLimitRemaining = null;
    }

    // Freshness gate — mirrors /api/health.
    const lastRefreshAt = stats.lastRefreshAt;
    const isEmpty = repos.length === 0 || !lastRefreshAt;
    const ageMs = lastRefreshAt
      ? Date.now() - new Date(lastRefreshAt).getTime()
      : null;
    const isStale = ageMs !== null && ageMs > STALE_THRESHOLD_MS;

    const healthStatus: "ok" | "stale" | "empty" = isEmpty
      ? "empty"
      : isStale
        ? "stale"
        : "ok";
    const healthy = healthStatus === "ok";
    const httpStatus = healthy ? 200 : 503;

    const body: PipelineStatusResponse = {
      seeded: repos.length > 0,
      healthy,
      healthStatus,
      ageSeconds: ageMs !== null ? Math.floor(ageMs / 1000) : null,
      repoCount: repos.length,
      snapshotCount,
      scoreCount: scoreStore.getAll().length,
      lastRefreshAt,
      rateLimitRemaining,
      stats: {
        totalRepos: stats.totalRepos,
        totalStars: stats.totalStars,
        hotCount: stats.hotCount,
        breakoutCount: stats.breakoutCount,
        lastRefreshAt,
      },
    };

    return NextResponse.json(body, { status: httpStatus });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
