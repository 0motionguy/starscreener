// GET /api/health
//
// Freshness-gated health endpoint designed for external uptime monitors
// (UptimeRobot, BetterStack, etc.). Returns 503 when the pipeline is
// stale or empty so a ping-style checker can alert without parsing JSON.
//
// Distinct from /api/pipeline/status, which is a data-counts snapshot
// and always returns 200 on a dead pipeline (see REPORT.md finding #5).
// Do not fold the two together — status is operator-facing telemetry,
// health is a boolean uptime gate.

import { NextResponse } from "next/server";
import { pipeline } from "@/lib/pipeline/pipeline";

// 2 hours ≈ 2× hot-tier cadence (see docs/INGESTION.md). Stale past this
// means at least one hot pass has missed; operator should be paged.
const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;

type HealthStatus = "ok" | "stale" | "empty" | "error";

interface HealthBody {
  status: HealthStatus;
  lastRefreshAt: string | null;
  ageSeconds: number | null;
  thresholdSeconds: number;
  error?: string;
}

export async function GET(): Promise<NextResponse<HealthBody>> {
  try {
    await pipeline.ensureReady();
    const stats = pipeline.getGlobalStats();
    const lastRefreshAt = stats.lastRefreshAt;

    if (!lastRefreshAt) {
      return NextResponse.json(
        {
          status: "empty",
          lastRefreshAt: null,
          ageSeconds: null,
          thresholdSeconds: STALE_THRESHOLD_MS / 1000,
        },
        { status: 503 },
      );
    }

    const ageMs = Date.now() - new Date(lastRefreshAt).getTime();
    const stale = ageMs > STALE_THRESHOLD_MS;

    return NextResponse.json(
      {
        status: stale ? "stale" : "ok",
        lastRefreshAt,
        ageSeconds: Math.floor(ageMs / 1000),
        thresholdSeconds: STALE_THRESHOLD_MS / 1000,
      },
      { status: stale ? 503 : 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        status: "error",
        lastRefreshAt: null,
        ageSeconds: null,
        thresholdSeconds: STALE_THRESHOLD_MS / 1000,
        error: message,
      },
      { status: 503 },
    );
  }
}
