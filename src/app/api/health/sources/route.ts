// GET /api/health/sources
//
// Per-source circuit-breaker breakdown for upstream adapter health. Companion
// to /api/health which still owns the freshness story (data-staleness based on
// last successful refresh timestamp). This endpoint surfaces:
//
//   - state machine (CLOSED / OPEN / HALF_OPEN) per source
//   - rolling success/failure counters and derived error rate
//   - openedAt / nextProbeAt for OPEN circuits
//   - lastSuccessAt + lastFailure (truncated message)
//
// Returned status:
//   - 200 when all known sources are CLOSED
//   - 207 (Multi-Status) when at least one breaker is OPEN or HALF_OPEN — the
//     payload itself is fine, but the multi-status code lets uptime monitors
//     differentiate "server up but degraded" from "server down".

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { verifyAdminAuth, verifyCronAuth } from "@/lib/api/auth";
import {
  KNOWN_SOURCES,
  sourceHealthTracker,
  type SourceHealthSnapshot,
} from "@/lib/source-health-tracker";

export const runtime = "nodejs";

// Recon-surface gating — circuit-breaker state + last-failure strings leak
// pipeline topology to anyone who curls. Public callers see the summary
// only; per-source detail (state, error rates, openedAt, lastFailure) needs
// CRON_SECRET or admin bearer. Mirrors the pattern in /api/health.
function canViewDetail(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  return (
    (cronSecret ? verifyCronAuth(request).kind === "ok" : false) ||
    verifyAdminAuth(request).kind === "ok"
  );
}

interface SourceBreakerView {
  state: SourceHealthSnapshot["state"];
  successCount: number;
  failureCount: number;
  errorRate: number;
  totalAttempts: number;
  windowSize: number;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailure: string | null;
  openedAt: string | null;
  nextProbeAt: string | null;
}

interface HealthSourcesBody {
  fetchedAt: string;
  summary: {
    total: number;
    closed: number;
    open: number;
    halfOpen: number;
    openSources: string[];
    halfOpenSources: string[];
  };
  options: {
    windowSize: number;
    failureThreshold: number;
    cooldownMs: number;
  };
  sources: Record<string, SourceBreakerView>;
}

function toView(snapshot: SourceHealthSnapshot): SourceBreakerView {
  return {
    state: snapshot.state,
    successCount: snapshot.successCount,
    failureCount: snapshot.failureCount,
    errorRate: Math.round(snapshot.errorRate * 1000) / 1000,
    totalAttempts: snapshot.totalAttempts,
    windowSize: snapshot.windowSize,
    consecutiveFailures: snapshot.consecutiveFailures,
    lastSuccessAt: snapshot.lastSuccessAt,
    lastFailureAt: snapshot.lastFailureAt,
    lastFailure: snapshot.lastFailure,
    openedAt: snapshot.openedAt,
    nextProbeAt: snapshot.nextProbeAt,
  };
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<HealthSourcesBody | Pick<HealthSourcesBody, "fetchedAt" | "summary">>> {
  const wantsDetail = request.nextUrl.searchParams.get("detail") === "1";
  const includeDetail = wantsDetail && canViewDetail(request);

  // Make sure the canonical list is always represented even before any
  // traffic flows (cold-start scenario on a fresh process).
  for (const id of KNOWN_SOURCES) {
    sourceHealthTracker.register(id);
  }

  const all = sourceHealthTracker.getAllHealth();
  const sources: Record<string, SourceBreakerView> = {};
  let closed = 0;
  let open = 0;
  let halfOpen = 0;
  const openSources: string[] = [];
  const halfOpenSources: string[] = [];

  for (const [id, snap] of Object.entries(all)) {
    sources[id] = toView(snap);
    if (snap.state === "OPEN") {
      open += 1;
      openSources.push(id);
    } else if (snap.state === "HALF_OPEN") {
      halfOpen += 1;
      halfOpenSources.push(id);
    } else {
      closed += 1;
    }
  }

  openSources.sort();
  halfOpenSources.sort();

  const opts = sourceHealthTracker.getOptions();
  const body: HealthSourcesBody = {
    fetchedAt: new Date().toISOString(),
    summary: {
      total: closed + open + halfOpen,
      closed,
      open,
      halfOpen,
      openSources,
      halfOpenSources,
    },
    options: {
      windowSize: opts.windowSize,
      failureThreshold: opts.failureThreshold,
      cooldownMs: opts.cooldownMs,
    },
    sources,
  };

  // 207 Multi-Status when degraded so monitors can split "down" from
  // "degraded but serving".
  const status = open + halfOpen > 0 ? 207 : 200;

  // Strip recon-surface fields for unauthorized callers — keeps uptime
  // monitors working (status + summary stay public) but hides per-source
  // failure messages, openedAt, error rates from drive-by curls.
  if (!includeDetail) {
    return NextResponse.json(
      { fetchedAt: body.fetchedAt, summary: body.summary },
      { status },
    );
  }
  return NextResponse.json(body, { status });
}
