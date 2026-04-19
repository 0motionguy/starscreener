// GET/POST /api/cron/ingest
//
// Cron-triggered ingestion endpoint. Picks a batch of repos for the requested
// tier (hot | warm | cold) from the tier scheduler and runs them through the
// real GitHub pipeline. Protected by CRON_SECRET — intended to be called by
// Vercel Cron (GET) or manually via curl (GET or POST).
//
// Query params:
//   tier = "hot" | "warm" | "cold" (default "hot")
//
// Auth contract:
//   - Header: `Authorization: Bearer ${CRON_SECRET}` (raw `${CRON_SECRET}` also accepted).
//   - If CRON_SECRET is set but the header is missing or wrong → 401.
//   - If CRON_SECRET is NOT set AND NODE_ENV=production → 503 "CRON_SECRET not configured".
//   - If CRON_SECRET is NOT set AND NODE_ENV !== "production" → allow (dev convenience).
//
// Pipeline contract (Phase 0 hardening):
//   - Adapter is constructed via `createGitHubAdapter({ useMock: false })`. A
//     missing GITHUB_TOKEN throws — we let it propagate and surface as HTTP 500.
//     No silent mock fallback.
//   - Every successful fetch writes a snapshot inside `pipeline.ingestBatch` →
//     `ingestRepo` → `snapshotStore.append`.
//   - After the batch, `pipeline.recomputeAll()` runs so scores, classifications,
//     reasons, and ranks are fresh before `/api/repos?filter=breakouts` is read.
//
// Response:
//   { ok: true, tier, processed, okCount, failed, rateLimitRemaining, durationMs, source }
//   — or { ok: false, reason, ... } on auth / config / rate-limit / ingest failure.

import { NextRequest, NextResponse } from "next/server";
import {
  pipeline,
  ensureSeededAsync,
  repoStore,
} from "@/lib/pipeline/pipeline";
import { createGitHubAdapter } from "@/lib/pipeline/ingestion/ingest";
import {
  DEFAULT_POLICIES,
  assignTier,
  buildRefreshPlan,
  getRefreshBatch,
} from "@/lib/pipeline/ingestion/scheduler";
import { isOnWatchlist } from "@/lib/pipeline/ingestion/watchlist";
import type { RefreshTier } from "@/lib/pipeline/types";
import type { TierContext } from "@/lib/pipeline/ingestion/scheduler";
import { recordCronActivity } from "@/lib/observability/cron-activity";

export interface CronIngestResponse {
  ok: true;
  tier: RefreshTier;
  processed: number;
  okCount: number;
  failed: number;
  rateLimitRemaining: number | null;
  durationMs: number;
  source: "github" | "mock";
}

export interface CronIngestErrorResponse {
  ok: false;
  reason: string;
  tier?: RefreshTier;
  durationMs?: number;
}

const VALID_TIERS: readonly RefreshTier[] = ["hot", "warm", "cold"] as const;

function parseTier(raw: string | null): RefreshTier {
  if (raw === "warm" || raw === "cold" || raw === "hot") return raw;
  return "hot";
}

type AuthVerdict =
  | { kind: "ok" }
  | { kind: "unauthorized" }
  | { kind: "not_configured_production" };

/**
 * Tri-state auth check:
 *  - "ok": request is authenticated, OR CRON_SECRET is unset and we're in dev.
 *  - "unauthorized": CRON_SECRET is set but header is missing/wrong → 401.
 *  - "not_configured_production": CRON_SECRET unset in production → 503.
 */
function verifyAuth(request: NextRequest): AuthVerdict {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return { kind: "not_configured_production" };
    }
    // Dev convenience: unauthenticated calls allowed when no secret is set.
    return { kind: "ok" };
  }
  const header = request.headers.get("authorization");
  if (!header) return { kind: "unauthorized" };
  // Accept both "Bearer <secret>" and raw "<secret>" for operator convenience.
  const trimmed = header.trim();
  if (trimmed === secret) return { kind: "ok" };
  if (trimmed.startsWith("Bearer ")) {
    return trimmed.slice("Bearer ".length) === secret
      ? { kind: "ok" }
      : { kind: "unauthorized" };
  }
  return { kind: "unauthorized" };
}

/**
 * Structured single-line JSON log. One line per cron invocation, parseable by
 * log aggregators (Vercel Logs, Datadog, etc.) without extra formatting.
 */
function logRun(payload: {
  tier: RefreshTier;
  count: number;
  ok: number;
  failed: number;
  rateLimitRemaining: number | null;
  durationMs: number;
  status: "ok" | "rate_limited" | "error" | "unauthorized" | "not_configured";
  error?: string;
}): void {
  const at = new Date().toISOString();
  const line = {
    at,
    scope: "cron:ingest",
    tier: payload.tier,
    count: payload.count,
    ok: payload.ok,
    failed: payload.failed,
    rateLimitRemaining: payload.rateLimitRemaining,
    durationMs: payload.durationMs,
    status: payload.status,
    ...(payload.error ? { error: payload.error } : {}),
  };
  // Single JSON line — keep on stdout so Vercel groups it as an info log.
  console.log(JSON.stringify(line));
  // P-119 (F-OBSV-001): also push to the in-memory ring buffer so
  // /api/health/cron-activity can surface fire-rate to uptime monitors.
  recordCronActivity({
    at,
    scope: "cron:ingest",
    tier: payload.tier,
    status: payload.status,
    durationMs: payload.durationMs,
    count: payload.count,
    ok: payload.ok,
    failed: payload.failed,
    rateLimitRemaining: payload.rateLimitRemaining,
    ...(payload.error ? { error: payload.error } : {}),
  });
}

/**
 * Core handler shared between GET and POST. Never throws.
 */
async function handleCronIngest(
  request: NextRequest,
): Promise<NextResponse<CronIngestResponse | CronIngestErrorResponse>> {
  const startedAt = Date.now();
  const { searchParams } = new URL(request.url);
  const tier = parseTier(searchParams.get("tier"));

  // 1. Auth.
  const auth = verifyAuth(request);
  if (auth.kind === "not_configured_production") {
    const durationMs = Date.now() - startedAt;
    logRun({
      tier,
      count: 0,
      ok: 0,
      failed: 0,
      rateLimitRemaining: null,
      durationMs,
      status: "not_configured",
      error: "CRON_SECRET not configured",
    });
    return NextResponse.json(
      {
        ok: false,
        reason:
          "CRON_SECRET not configured — refusing to run unauthenticated cron in production",
        tier,
        durationMs,
      },
      { status: 503 },
    );
  }
  if (auth.kind === "unauthorized") {
    const durationMs = Date.now() - startedAt;
    logRun({
      tier,
      count: 0,
      ok: 0,
      failed: 0,
      rateLimitRemaining: null,
      durationMs,
      status: "unauthorized",
    });
    return NextResponse.json(
      { ok: false, reason: "unauthorized", tier, durationMs },
      { status: 401 },
    );
  }

  // 2. Validate tier.
  if (!VALID_TIERS.includes(tier)) {
    return NextResponse.json(
      { ok: false, reason: `invalid tier "${tier}"` },
      { status: 400 },
    );
  }

  try {
    // 3. Ensure state is loaded from disk (or seeded from mocks).
    await ensureSeededAsync();

    // 4. Build refresh plans and pick the top N for this tier.
    const allRepos = repoStore.getAll();
    if (allRepos.length === 0) {
      const durationMs = Date.now() - startedAt;
      logRun({
        tier,
        count: 0,
        ok: 0,
        failed: 0,
        rateLimitRemaining: null,
        durationMs,
        status: "ok",
      });
      return NextResponse.json({
        ok: true,
        tier,
        processed: 0,
        okCount: 0,
        failed: 0,
        rateLimitRemaining: null,
        durationMs,
        source: process.env.GITHUB_TOKEN ? "github" : "mock",
      });
    }

    // P0.3: hot-tier candidate set = curated AI watchlist. Without this
    // wire-up, no repo ever satisfies assignTier's hot-tier gate (which
    // requires isWatchlisted || isTopMover || isBreakout || categoryLeader)
    // and `/api/cron/ingest?tier=hot` returns processed:0 in 5ms. See
    // src/lib/pipeline/ingestion/watchlist.ts + the interim cron-tier=warm
    // fix shipped in commit 8771186.

    const plans = allRepos.map((repo) => {
      const perRepoCtx: TierContext = {
        isWatchlisted: isOnWatchlist(repo.fullName),
        isTopMover: false,
        isBreakout: repo.movementStatus === "hot",
        categoryLeaderIds: new Set<string>(),
      };
      const perRepoTier = assignTier(repo, perRepoCtx);
      return {
        plan: buildRefreshPlan(repo, perRepoTier, undefined, perRepoCtx),
        assignedTier: perRepoTier,
      };
    });

    const tierPlans = plans
      .filter((p) => p.assignedTier === tier)
      .map((p) => p.plan);

    const cap = DEFAULT_POLICIES[tier].maxPerHour;
    const batchPlans = getRefreshBatch(tierPlans, cap);

    // Map repo ids back to full names the ingest pipeline expects.
    const fullNames: string[] = [];
    for (const p of batchPlans) {
      const repo = repoStore.get(p.repoId);
      if (repo) fullNames.push(repo.fullName);
    }

    if (fullNames.length === 0) {
      const durationMs = Date.now() - startedAt;
      logRun({
        tier,
        count: 0,
        ok: 0,
        failed: 0,
        rateLimitRemaining: null,
        durationMs,
        status: "ok",
      });
      return NextResponse.json({
        ok: true,
        tier,
        processed: 0,
        okCount: 0,
        failed: 0,
        rateLimitRemaining: null,
        durationMs,
        source: process.env.GITHUB_TOKEN ? "github" : "mock",
      });
    }

    // 5. Build the real adapter. Phase 0 contract: useMock=false means a
    //    missing GITHUB_TOKEN throws synchronously. We DO NOT catch and
    //    fall back to a mock — the throw propagates to the outer catch
    //    block below and surfaces as HTTP 500 with the token-missing message.
    const adapter = createGitHubAdapter({ useMock: false });

    // 6. Run ingest batch. Snapshotter writes happen inside ingestRepo on
    //    every successful fetch (see ingestion/ingest.ts → buildSnapshot →
    //    snapshotStore.append).
    const batch = await pipeline.ingestBatch(fullNames, {
      githubAdapter: adapter,
    });

    // 7. Rate-limit guard: if the adapter exhausted its budget, surface it.
    if (batch.rateLimitRemaining !== null && batch.rateLimitRemaining <= 0) {
      // Still run recompute so any repos ingested before the limit hit
      // are visible to downstream queries.
      await pipeline.recomputeAll();
      const durationMs = Date.now() - startedAt;
      logRun({
        tier,
        count: fullNames.length,
        ok: batch.ok,
        failed: batch.failed,
        rateLimitRemaining: batch.rateLimitRemaining,
        durationMs,
        status: "rate_limited",
      });
      return NextResponse.json({
        ok: false,
        reason: "rate-limited",
        tier,
        durationMs,
      });
    }

    // 8. Recompute so scores / classifications / reasons / ranks are fresh
    //    for /api/repos?filter=breakouts and related queries on the next read.
    await pipeline.recomputeAll();

    const durationMs = Date.now() - startedAt;
    logRun({
      tier,
      count: fullNames.length,
      ok: batch.ok,
      failed: batch.failed,
      rateLimitRemaining: batch.rateLimitRemaining,
      durationMs,
      status: "ok",
    });

    return NextResponse.json({
      ok: true,
      tier,
      processed: batch.total,
      okCount: batch.ok,
      failed: batch.failed,
      rateLimitRemaining: batch.rateLimitRemaining,
      durationMs,
      // Adapter is always real GitHub at this point (useMock:false). If the
      // mock path ever runs (e.g., through a different code path), the
      // adapter.id check inside ingestRepo will still flag it — so we hard
      // code "github" here to match the contract.
      source: "github",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron:ingest] unexpected error", err);
    const durationMs = Date.now() - startedAt;
    logRun({
      tier,
      count: 0,
      ok: 0,
      failed: 0,
      rateLimitRemaining: null,
      durationMs,
      status: "error",
      error: message,
    });
    return NextResponse.json(
      {
        ok: false,
        reason: `internal error: ${message}`,
        tier,
        durationMs,
      },
      { status: 500 },
    );
  }
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<CronIngestResponse | CronIngestErrorResponse>> {
  return handleCronIngest(request);
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<CronIngestResponse | CronIngestErrorResponse>> {
  return handleCronIngest(request);
}
