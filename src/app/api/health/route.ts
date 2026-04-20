// GET /api/health
//
// Freshness-gated health endpoint for external uptime monitors
// (UptimeRobot, BetterStack, etc.). Returns 503 when EITHER the OSS
// Insight scrape OR the git-history delta computation is stale.
//
// Phase 3: the snapshot pipeline's `lastRefreshAt` is no longer consulted
// — it's ephemeral on Vercel Lambdas and meaningless across invocations.
// Both freshness signals here ride committed JSON (data/trending.json and
// data/deltas.json) so every Lambda sees the same view.
//
// Distinct from /api/pipeline/status, which reports per-pipeline stats
// on top of the same freshness gate.

import { NextResponse } from "next/server";
import {
  lastFetchedAt,
  deltasComputedAt,
  deltasCoveragePct,
} from "@/lib/trending";

// 2 hours ≈ 2× hourly GHA cadence. Stale past this means at least one tick
// has missed; operator should be paged.
const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;

// Below this percent of repos having ≥1 non-null delta, the endpoint emits
// a warning field. Expected during the first 30 days of accumulation.
const COVERAGE_WARN_PCT = 50;

type HealthStatus = "ok" | "stale" | "error";

interface HealthBody {
  status: HealthStatus;
  lastFetchedAt: string | null;
  computedAt: string | null;
  ageSeconds: { scraper: number | null; deltas: number | null };
  thresholdSeconds: number;
  stale: { scraper: boolean; deltas: boolean };
  coveragePct: number;
  warning?: string;
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
    const scraperAge = ageMs(lastFetchedAt);
    const deltasAge = ageMs(deltasComputedAt);

    const scraperStale = scraperAge === null || scraperAge > STALE_THRESHOLD_MS;
    const deltasStale = deltasAge === null || deltasAge > STALE_THRESHOLD_MS;
    const anyStale = scraperStale || deltasStale;

    const coverage = deltasCoveragePct();
    const coverageLow = coverage < COVERAGE_WARN_PCT;

    const body: HealthBody = {
      status: anyStale ? "stale" : "ok",
      lastFetchedAt: lastFetchedAt ?? null,
      computedAt: deltasComputedAt ?? null,
      ageSeconds: {
        scraper: scraperAge === null ? null : Math.floor(scraperAge / 1000),
        deltas: deltasAge === null ? null : Math.floor(deltasAge / 1000),
      },
      thresholdSeconds: STALE_THRESHOLD_MS / 1000,
      stale: { scraper: scraperStale, deltas: deltasStale },
      coveragePct: Math.round(coverage * 10) / 10,
    };

    if (!anyStale && coverageLow) {
      body.warning = `delta coverage ${body.coveragePct}% < ${COVERAGE_WARN_PCT}% — expected during 30-day cold-start window`;
    }

    return NextResponse.json(body, { status: anyStale ? 503 : 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        status: "error",
        lastFetchedAt: lastFetchedAt ?? null,
        computedAt: deltasComputedAt ?? null,
        ageSeconds: { scraper: null, deltas: null },
        thresholdSeconds: STALE_THRESHOLD_MS / 1000,
        stale: { scraper: true, deltas: true },
        coveragePct: 0,
        error: message,
      },
      { status: 503 },
    );
  }
}
