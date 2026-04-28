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
// Rate-limiting (POST): per-IP token bucket, 1 request / 60s. Keyed on the
// first address in `x-forwarded-for` falling back to the socket address.
// Memory-local — intentional: a single Vercel Lambda handles bursts from a
// client cooldown, and a distributed limit isn't needed for a per-profile
// refresh button.
//
// Auth: none. The button is a visible, idempotent-ish affordance on a
// public profile page. The per-IP cooldown + the client-side 60s button
// lockout are the only abuse controls.
//
// Caching: GET → s-maxage=30, SWR=60. POST → no-store.

import { NextRequest, NextResponse } from "next/server";
import path from "node:path";

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

export const runtime = "nodejs";

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

// ---------------------------------------------------------------------------
// Rate limiting (per-IP, in-memory)
// ---------------------------------------------------------------------------

const RATE_LIMIT_MS = 60_000;
const rateLimitMap = new Map<string, number>();

function clientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

function pruneRateLimit(now: number): void {
  // Prevent unbounded growth — drop entries older than two windows.
  if (rateLimitMap.size < 1024) return;
  const cutoff = now - RATE_LIMIT_MS * 2;
  for (const [key, last] of rateLimitMap.entries()) {
    if (last < cutoff) rateLimitMap.delete(key);
  }
}

function checkRateLimit(ip: string): { ok: true } | { ok: false; retryAfterMs: number } {
  const now = Date.now();
  const last = rateLimitMap.get(ip);
  if (last !== undefined && now - last < RATE_LIMIT_MS) {
    return { ok: false, retryAfterMs: RATE_LIMIT_MS - (now - last) };
  }
  rateLimitMap.set(ip, now);
  pruneRateLimit(now);
  return { ok: true };
}

// Test-only escape hatch — Next.js forbids extra named exports in route
// files, so we publish the reset hook on `globalThis` under a symbol key.
// Tests import the route then call `(globalThis as any)[AISO_TEST_RESET]()`
// without polluting the route's public type surface.
const AISO_TEST_RESET = Symbol.for("trendingrepo.aiso.test.reset");
(globalThis as unknown as Record<symbol, () => void>)[AISO_TEST_RESET] = () => {
  rateLimitMap.clear();
};

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

  const ip = clientIp(request);
  const rl = checkRateLimit(ip);
  if (!rl.ok) {
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

  try {
    await enqueueRescan({
      fullName: repo.fullName,
      websiteUrl,
      requestedAt: queuedAt,
      requestIp: ip,
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
