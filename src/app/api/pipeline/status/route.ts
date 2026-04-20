// GET /api/pipeline/status
//
// Telemetry + freshness gate for the pipeline. Reports data-volume counts
// on top of the same two freshness signals /api/health enforces.
//
// Phase 3: dropped `lastRefreshAt` / `getGlobalStats().lastRefreshAt` as
// freshness sources — they rode the ephemeral Vercel /tmp snapshot store
// and always looked stale on prod. Both gates now read committed JSON:
// trending.json (scraper) and deltas.json (delta computation).
//
// `stats.lastRefreshAt` is kept in the response shape for backwards
// compatibility with FilterBar → StatsBarClient, but now points at the
// scrape timestamp — semantically "last time data was refreshed", which
// matches what the UI label claims to show.

import { NextResponse } from "next/server";
import { pipeline, repoStore, scoreStore, snapshotStore } from "@/lib/pipeline/pipeline";
import { createGitHubAdapter } from "@/lib/pipeline/ingestion/ingest";
import {
  lastFetchedAt,
  deltasComputedAt,
  deltasCoveragePct,
} from "@/lib/trending";

// Must stay in lockstep with src/app/api/health/route.ts STALE_THRESHOLD_MS.
const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;

export interface PipelineStatusResponse {
  seeded: boolean;
  healthy: boolean;
  healthStatus: "ok" | "stale" | "empty";
  ageSeconds: number | null;
  repoCount: number;
  snapshotCount: number;
  scoreCount: number;
  lastFetchedAt: string | null;
  computedAt: string | null;
  coveragePct: number;
  stale: { scraper: boolean; deltas: boolean };
  rateLimitRemaining: number | null;
  stats: {
    totalRepos: number;
    totalStars: number;
    hotCount: number;
    breakoutCount: number;
    lastRefreshAt: string | null;
  };
}

function ageMs(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Date.now() - t;
}

export async function GET(): Promise<NextResponse<PipelineStatusResponse | { error: string }>> {
  try {
    // Hydrate persisted state from disk (or fall back to mock seed) before
    // any reads so the local telemetry counts reflect the durable snapshot.
    await pipeline.ensureReady();

    const stats = pipeline.getGlobalStats();
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

    // Freshness — same logic as /api/health.
    const scraperAge = ageMs(lastFetchedAt);
    const deltasAge = ageMs(deltasComputedAt);
    const scraperStale = scraperAge === null || scraperAge > STALE_THRESHOLD_MS;
    const deltasStale = deltasAge === null || deltasAge > STALE_THRESHOLD_MS;

    const isEmpty = !lastFetchedAt;
    const isStale = !isEmpty && (scraperStale || deltasStale);
    const healthStatus: "ok" | "stale" | "empty" = isEmpty
      ? "empty"
      : isStale
        ? "stale"
        : "ok";
    const healthy = healthStatus === "ok";
    const httpStatus = healthy ? 200 : 503;

    // `ageSeconds` preserves its top-level field for consumers that read it,
    // but now reflects the older of the two freshness signals so a stale
    // scraper or stale delta computation both surface.
    const worstAgeMs =
      scraperAge === null || deltasAge === null
        ? scraperAge ?? deltasAge
        : Math.max(scraperAge, deltasAge);

    const body: PipelineStatusResponse = {
      seeded: repos.length > 0,
      healthy,
      healthStatus,
      ageSeconds: worstAgeMs === null ? null : Math.floor(worstAgeMs / 1000),
      repoCount: repos.length,
      snapshotCount,
      scoreCount: scoreStore.getAll().length,
      lastFetchedAt: lastFetchedAt ?? null,
      computedAt: deltasComputedAt ?? null,
      coveragePct: Math.round(deltasCoveragePct() * 10) / 10,
      stale: { scraper: scraperStale, deltas: deltasStale },
      rateLimitRemaining,
      stats: {
        totalRepos: stats.totalRepos,
        totalStars: stats.totalStars,
        hotCount: stats.hotCount,
        breakoutCount: stats.breakoutCount,
        // UI contract: StatsBar renders "last refreshed Xm ago" off this
        // field. Point at the scrape timestamp — it's the honest "last
        // time we learned anything new" signal.
        lastRefreshAt: lastFetchedAt ?? null,
      },
    };

    return NextResponse.json(body, { status: httpStatus });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
