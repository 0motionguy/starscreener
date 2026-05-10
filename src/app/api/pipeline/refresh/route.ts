// POST /api/pipeline/refresh
//
// Public "nudge the UI" endpoint for the Refresh button in the stats bar and
// Featured Cards section. Unlike /api/pipeline/recompute (which is gated by
// CRON_SECRET and does a full pass), this endpoint:
//
//   1. Rate-limits per client IP (60s window, 1 call per IP) so a hostile
//      client can't use it as a free DDoS amplifier into recomputeAll.
//   2. Applies a short shared cooldown (30s) across ALL refresh callers via
//      the same distributed limiter so a burst from many IPs can't stampede
//      the pipeline either.
//   3. Runs the same underlying `pipeline.recomputeAll()` work — via the
//      existing withRecomputeLock coalescing path, so concurrent refreshers
//      observe one pass's summary rather than stacking.
//
// Why not just expose CRON_SECRET to the browser? Any token shipped to the
// client would appear in devtools, extensions, and the network tab of every
// visitor. A leaked CRON_SECRET lets an attacker drive every protected cron
// endpoint (ingest, persist, recompute, cleanup, rebuild, backfill, enrich)
// — far worse than the small DDoS risk of a public rate-limited refresh.
//
// The cron still runs recomputeAll on its schedule. This endpoint's only
// job is to make the UI feel fresh after a user action.

import { NextRequest, NextResponse } from "next/server";
import { pipeline } from "@/lib/pipeline/pipeline";
import { checkRateLimitAsync } from "@/lib/api/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface RefreshResponse {
  ok: true;
  scheduledAt: number;
  willRunBy: number;
  reposRecomputed: number;
  scoresComputed: number;
  reasonsGenerated: number;
  durationMs: number;
  coalesced?: true;
}

export interface RefreshErrorResponse {
  ok: false;
  error: string;
  retryAfterSec?: number;
}

// Shared cooldown across all refresh callers (any IP). Distinct from the
// per-IP rate limit above: the IP limit blunts one bad actor; this blunts a
// stampede from the full userbase. It intentionally uses the existing async
// rate-limit store so production enforcement is shared across Vercel Lambdas
// when Upstash is configured, with the same memory fallback in local/dev.
const GLOBAL_COOLDOWN_WINDOW_MS = 30_000;
const GLOBAL_COOLDOWN_MAX_REQUESTS = 1;
const GLOBAL_COOLDOWN_KEY = "pipeline-refresh-global";

// Per-IP window — 1 call / IP / 60s. Uses the shared Upstash-backed limiter
// via checkRateLimitAsync, so enforcement holds across every Vercel Lambda
// instance (memory fallback when UPSTASH_REDIS_REST_* env is unset).
const PER_IP_WINDOW_MS = 60_000;
const PER_IP_MAX_REQUESTS = 1;
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function globalCooldownRequest(request: NextRequest): Request {
  return new Request(request.url, {
    headers: { "x-forwarded-for": GLOBAL_COOLDOWN_KEY },
  });
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<RefreshResponse | RefreshErrorResponse>> {
  // Per-IP gate.
  const limit = await checkRateLimitAsync(request, {
    windowMs: PER_IP_WINDOW_MS,
    maxRequests: PER_IP_MAX_REQUESTS,
  });
  if (!limit.allowed) {
    const waitSec = Math.max(1, Math.ceil(limit.retryAfterMs / 1000));
    return NextResponse.json(
      {
        ok: false,
        error: `rate limited (${waitSec}s remaining)`,
        retryAfterSec: waitSec,
      },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          "Retry-After": String(waitSec),
          "X-RateLimit-Limit": String(PER_IP_MAX_REQUESTS),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(limit.resetAt / 1000)),
        },
      },
    );
  }

  // Global cooldown gate — avoids N clients from N IPs all stampeding the
  // pipeline at once.
  const globalLimit = await checkRateLimitAsync(globalCooldownRequest(request), {
    windowMs: GLOBAL_COOLDOWN_WINDOW_MS,
    maxRequests: GLOBAL_COOLDOWN_MAX_REQUESTS,
  });
  if (!globalLimit.allowed) {
    const waitSec = Math.max(1, Math.ceil(globalLimit.retryAfterMs / 1000));
    return NextResponse.json(
      {
        ok: false,
        error: `cooldown active (${waitSec}s remaining)`,
        retryAfterSec: waitSec,
      },
      {
        status: 429,
        headers: { ...NO_STORE_HEADERS, "Retry-After": String(waitSec) },
      },
    );
  }

  const scheduledAt = Date.now();

  try {
    await pipeline.ensureReady();
    // pipeline.recomputeAll uses withRecomputeLock under the hood, so if a
    // cron run is already in flight, we coalesce onto it rather than
    // double-running.
    const summary = await pipeline.recomputeAll();
    const finishedAt = Date.now();
    return NextResponse.json(
      {
        ok: true,
        scheduledAt,
        willRunBy: finishedAt,
        reposRecomputed: summary.reposRecomputed,
        scoresComputed: summary.scoresComputed,
        reasonsGenerated: summary.reasonsGenerated,
        durationMs: summary.durationMs,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
