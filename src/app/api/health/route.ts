// GET /api/health
//
// Freshness-gated health endpoint designed for external uptime monitors
// (UptimeRobot, BetterStack, etc.). Returns 503 when EITHER the trending
// scraper OR the ingestion pipeline is stale so a ping-style checker can
// alert without parsing JSON.
//
// Distinct from /api/pipeline/status, which is a data-counts snapshot
// and always returns 200 on a dead pipeline (see REPORT.md finding #5).
// Do not fold the two together — status is operator-facing telemetry,
// health is a boolean uptime gate.

import { NextResponse } from "next/server";
import { pipeline } from "@/lib/pipeline/pipeline";
import { lastFetchedAt } from "@/lib/trending";

// 2 hours ≈ 2× hot-tier cadence (see docs/INGESTION.md). Stale past this
// means at least one hot pass (or scrape) has missed; operator should be paged.
const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;

type HealthStatus = "ok" | "stale" | "error";

interface HealthBody {
  status: HealthStatus;
  lastFetchedAt: string | null;
  lastRefreshAt: string | null;
  ageSeconds: { scraper: number | null; pipeline: number | null };
  thresholdSeconds: number;
  stale: { scraper: boolean; pipeline: boolean };
  error?: string;
}

function ageMs(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Date.now() - t;
}

export async function GET(): Promise<NextResponse<HealthBody>> {
  try {
    await pipeline.ensureReady();
    const stats = pipeline.getGlobalStats();
    const lastRefreshAt = stats.lastRefreshAt;

    const scraperAge = ageMs(lastFetchedAt);
    const pipelineAge = ageMs(lastRefreshAt);

    // null age = no data ever → treat as stale (operator should be paged).
    const scraperStale = scraperAge === null || scraperAge > STALE_THRESHOLD_MS;
    const pipelineStale = pipelineAge === null || pipelineAge > STALE_THRESHOLD_MS;
    const anyStale = scraperStale || pipelineStale;

    return NextResponse.json(
      {
        status: anyStale ? "stale" : "ok",
        lastFetchedAt: lastFetchedAt ?? null,
        lastRefreshAt: lastRefreshAt ?? null,
        ageSeconds: {
          scraper: scraperAge === null ? null : Math.floor(scraperAge / 1000),
          pipeline: pipelineAge === null ? null : Math.floor(pipelineAge / 1000),
        },
        thresholdSeconds: STALE_THRESHOLD_MS / 1000,
        stale: { scraper: scraperStale, pipeline: pipelineStale },
      },
      { status: anyStale ? 503 : 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        status: "error",
        lastFetchedAt: lastFetchedAt ?? null,
        lastRefreshAt: null,
        ageSeconds: { scraper: null, pipeline: null },
        thresholdSeconds: STALE_THRESHOLD_MS / 1000,
        stale: { scraper: true, pipeline: true },
        error: message,
      },
      { status: 503 },
    );
  }
}
