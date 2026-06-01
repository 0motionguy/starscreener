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

import {
  DISABLED_SOURCES,
  KNOWN_SOURCES,
  sourceHealthTracker,
  type SourceHealthSnapshot,
} from "@/lib/source-health-tracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SourceBreakerView {
  state: SourceHealthSnapshot["state"];
  status: "ok" | "degraded" | "unknown";
  attempted: boolean;
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
    disabled: number;
    neverAttempted: number;
    openSources: string[];
    halfOpenSources: string[];
    neverAttemptedSources: string[];
    disabledSources: string[];
  };
  options: {
    windowSize: number;
    failureThreshold: number;
    cooldownMs: number;
  };
  sources: Record<string, SourceBreakerView>;
}

function toView(snapshot: SourceHealthSnapshot): SourceBreakerView {
  const attempted = snapshot.totalAttempts > 0;
  return {
    state: snapshot.state,
    status: !attempted
      ? "unknown"
      : snapshot.state === "CLOSED"
        ? "ok"
        : "degraded",
    attempted,
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

export async function GET(): Promise<NextResponse<HealthSourcesBody>> {
  const trace = process.env.PERF_TRACE_ROUTES === "1";
  const startedAt = performance.now();
  // Make sure the canonical list is always represented even before any
  // traffic flows (cold-start scenario on a fresh process).
  const registerStart = performance.now();
  for (const id of KNOWN_SOURCES) {
    sourceHealthTracker.register(id);
  }
  const registerMs = performance.now() - registerStart;

  const getAllStart = performance.now();
  const sources: Record<string, SourceBreakerView> = {};
  let closed = 0;
  let open = 0;
  let halfOpen = 0;
  let neverAttempted = 0;
  const openSources: string[] = [];
  const halfOpenSources: string[] = [];
  const neverAttemptedSources: string[] = [];

  // Only enabled canonical sources participate in the health calculation.
  // Disabled adapters can still be constructed directly by legacy callers and
  // auto-register in the tracker via recordFailure(); those snapshots must not
  // reopen this endpoint after the operator has intentionally switched them off.
  for (const id of KNOWN_SOURCES) {
    const snap = sourceHealthTracker.getHealth(id);
    sources[id] = toView(snap);
    if (snap.totalAttempts === 0) {
      neverAttempted += 1;
      neverAttemptedSources.push(id);
    }
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
  neverAttemptedSources.sort();
  const getAllMs = performance.now() - getAllStart;

  const opts = sourceHealthTracker.getOptions();
  const body: HealthSourcesBody = {
    fetchedAt: new Date().toISOString(),
    summary: {
      total: closed + open + halfOpen,
      closed,
      open,
      halfOpen,
      disabled: DISABLED_SOURCES.length,
      neverAttempted,
      openSources,
      halfOpenSources,
      neverAttemptedSources,
      disabledSources: [...DISABLED_SOURCES].sort(),
    },
    options: {
      windowSize: opts.windowSize,
      failureThreshold: opts.failureThreshold,
      cooldownMs: opts.cooldownMs,
    },
    sources,
  };

  // 207 Multi-Status when degraded so monitors can split "down" from
  // "degraded but serving". Zero-attempt sources are unknown, not green.
  const status = open + halfOpen + neverAttempted > 0 ? 207 : 200;
  if (trace) {
    const totalMs = performance.now() - startedAt;
    console.info(
      `[perf][route:/api/health/sources] totalMs=${totalMs.toFixed(1)} registerMs=${registerMs.toFixed(1)} getAllMs=${getAllMs.toFixed(1)} totalSources=${Object.keys(sources).length} open=${open} halfOpen=${halfOpen} neverAttempted=${neverAttempted}`,
    );
  }
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}
