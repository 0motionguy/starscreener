// GET / POST /api/repos/[owner]/[name]/aiso
//
// User-triggered AISO (AI discoverability) scan status + rescan endpoint.
//
// GET  → current AISO scan status for the repo.
//        Shape: { ok: true, status, score?, dimensions?, lastScanAt,
//                 signals?, engineCitations? }
//        If the repo exists but has never been scanned, returns
//        { ok: true, status: "none" } with 200.
//
// POST → enqueues a rescan. Does NOT invoke the scanner inline; instead
//        appends a row to `aiso-rescan-queue.jsonl` under the pipeline data
//        directory. An operator cron / worker is expected to drain that
//        queue and feed scans into the existing aiso-tools pipeline
//        (src/lib/aiso-tools.ts). This route never touches the scanner
//        state directly — the scanner stays the source of truth.
//
// Rate-limiting (POST): per-IP fixed window, 1 request / 60s, backed by
// Upstash Redis (shared across every Vercel Lambda) when configured, with
// in-process memory fallback otherwise. Migrated from the previous local
// rateLimitMap because cold starts on Vercel cycle Lambdas frequently
// enough that a determined attacker could exceed the cap by spraying
// requests across instances.
//
// Auth: none. The button is a visible, idempotent-ish affordance on a
// public profile page. The per-IP cooldown + the client-side 60s button
// lockout are the only abuse controls.
//
// Caching: GET → s-maxage=30, SWR=60. POST → no-store.

import { NextRequest, NextResponse } from "next/server";
import path from "node:path";

import { checkRateLimitAsync } from "@/lib/api/rate-limit";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import {
  getRepoProfile,
  refreshRepoProfilesFromStore,
} from "@/lib/repo-profiles";
import {
  appendJsonlFile,
  currentDataDir,
} from "@/lib/pipeline/storage/file-persistence";
import type {
  AisoToolsDimension,
  AisoToolsScan,
} from "@/lib/aiso-tools";

const SLUG_PART_PATTERN = /^[A-Za-z0-9._-]+$/;

const GET_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
} as const;

const POST_CACHE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

// ---------------------------------------------------------------------------
// Surfaced status — the union the UI renders actions against
// ---------------------------------------------------------------------------
//
// The RepoProfileStatus union carries several internal states
// (`scan_pending`, `scan_running`, `no_website`) that the UI collapses into
// four user-facing buckets: `scanned` | `queued` | `rate_limited` | `failed`.
// `none` covers the "never tried, never will" case (no website / no profile
// row) so the button component can decide to render nothing.

export type AisoUiStatus =
  | "scanned"
  | "queued"
  | "rate_limited"
  | "failed"
  | "none";

function toUiStatus(scan: AisoToolsScan | null, profileStatus: string | undefined): AisoUiStatus {
  if (scan?.status === "completed") return "scanned";
  if (profileStatus === "rate_limited") return "rate_limited";
  if (profileStatus === "scan_failed") return "failed";
  if (scan?.status === "failed") return "failed";
  if (profileStatus === "scan_pending" || profileStatus === "scan_running") return "queued";
  if (scan?.status === "queued" || scan?.status === "running") return "queued";
  return "none";
}

function topDimensions(
  dimensions: AisoToolsDimension[] | undefined,
  n: number,
): AisoToolsDimension[] {
  if (!dimensions?.length) return [];
  return [...dimensions]
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

// Rate-limiting now lives in src/lib/api/rate-limit.ts via checkRateLimitAsync.
// Keep the AISO_RATE_LIMIT constants here so the per-route policy stays visible
// at the top of the file — only the storage layer moved.
const AISO_RATE_LIMIT = { windowMs: 60_000, maxRequests: 1 } as const;

// ---------------------------------------------------------------------------
// Rescan queue
// ---------------------------------------------------------------------------

const RESCAN_QUEUE_FILE = "aiso-rescan-queue.jsonl";

interface RescanQueueRow {
  fullName: string;
  websiteUrl: string | null;
  requestedAt: string;
  requestIp: string;
  source: "user-retry";
}

async function enqueueRescan(row: RescanQueueRow): Promise<void> {
  await appendJsonlFile(RESCAN_QUEUE_FILE, row);
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string }> },
) {
  const { owner, name } = await params;

  if (!SLUG_PART_PATTERN.test(owner) || !SLUG_PART_PATTERN.test(name)) {
    return NextResponse.json(
      { ok: false, error: "Invalid repo slug" },
      { status: 400 },
    );
  }

  const repo = getDerivedRepoByFullName(`${owner}/${name}`);
  if (!repo) {
    return NextResponse.json(
      { ok: false, error: "Repo not found" },
      { status: 404 },
    );
  }

  await refreshRepoProfilesFromStore();
  const profile = getRepoProfile(repo.fullName);
  const scan = profile?.aisoScan ?? null;
  const uiStatus = toUiStatus(scan, profile?.status);

  if (uiStatus === "none" && !scan) {
    return NextResponse.json(
      {
        ok: true,
        status: "none" as const,
        lastScanAt: null,
      },
      { headers: GET_CACHE_HEADERS },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      status: uiStatus,
      score: scan?.score ?? null,
      tier: scan?.tier ?? null,
      dimensions: scan?.dimensions ?? [],
      topDimensions: topDimensions(scan?.dimensions, 3),
      lastScanAt: scan?.completedAt ?? profile?.lastProfiledAt ?? null,
      signals: scan
        ? {
            runtimeVisibility: scan.runtimeVisibility,
            issuesCount: scan.issues.length,
          }
        : null,
      engineCitations: scan
        ? scan.promptTests.map((t) => ({
            engine: t.engine,
            cited: t.cited,
            brandMentioned: t.brandMentioned,
            position: t.position,
          }))
        : [],
      resultUrl: scan?.resultUrl ?? null,
    },
    { headers: GET_CACHE_HEADERS },
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string }> },
) {
  const { owner, name } = await params;

  if (!SLUG_PART_PATTERN.test(owner) || !SLUG_PART_PATTERN.test(name)) {
    return NextResponse.json(
      { ok: false, error: "Invalid repo slug" },
      { status: 400, headers: POST_CACHE_HEADERS },
    );
  }

  const repo = getDerivedRepoByFullName(`${owner}/${name}`);
  if (!repo) {
    return NextResponse.json(
      { ok: false, error: "Repo not found" },
      { status: 404, headers: POST_CACHE_HEADERS },
    );
  }

  const rl = await checkRateLimitAsync(request, AISO_RATE_LIMIT);
  if (!rl.allowed) {
    const retryAfterSec = Math.max(1, Math.ceil(rl.retryAfterMs / 1000));
    return NextResponse.json(
      {
        ok: false,
        error: "Rate limited — one rescan per 60s per IP",
        retryAfterMs: rl.retryAfterMs,
      },
      {
        status: 429,
        headers: {
          ...POST_CACHE_HEADERS,
          "Retry-After": String(retryAfterSec),
        },
      },
    );
  }

  await refreshRepoProfilesFromStore();
  const profile = getRepoProfile(repo.fullName);
  const websiteUrl = profile?.websiteUrl ?? null;
  const queuedAt = new Date().toISOString();

  // Recover the client IP for the queue trace. The rate-limit module extracts
  // it internally from x-forwarded-for; we just mirror that header read here
  // so the queued row carries the same value.
  const xff = request.headers.get("x-forwarded-for");
  const requestIp = xff ? (xff.split(",")[0]?.trim() ?? "unknown") : "unknown";

  try {
    await enqueueRescan({
      fullName: repo.fullName,
      websiteUrl,
      requestedAt: queuedAt,
      requestIp,
      source: "user-retry",
    });
  } catch (err) {
    console.error(
      `[api:aiso] failed to enqueue rescan for ${repo.fullName}`,
      err,
    );
    return NextResponse.json(
      { ok: false, error: "Could not enqueue rescan" },
      { status: 500, headers: POST_CACHE_HEADERS },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      status: "queued" as const,
      queuedAt,
      queuePath: path.join(currentDataDir(), RESCAN_QUEUE_FILE),
    },
    { headers: POST_CACHE_HEADERS },
  );
}
