// GET /api/admin/stats
//
// At-a-glance signals for the admin dashboard:
//   1. GitHub API rate limit remaining (best-effort fetch, never 500s).
//   2. Which freshness signals are tripping the global STALE banner — replicates
//      the boolean logic in src/app/api/pipeline/status/route.ts.
//   3. Disk usage of the .data/ and data/ dirs (recursive, tolerant of missing
//      paths and unreadable entries).
//
// Auth: ADMIN_TOKEN via verifyAdminAuth. Cache-Control: no-store.

import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

import { adminAuthFailureResponse, verifyAdminAuth } from "@/lib/api/auth";
import { githubFetch } from "@/lib/github-fetch";
import { FAST_DATA_STALE_THRESHOLD_MS } from "@/lib/source-health";
import { lastFetchedAt, deltasComputedAt } from "@/lib/trending";
import { hotCollectionsFetchedAt } from "@/lib/hot-collections";
import { collectionRankingsFetchedAt } from "@/lib/collection-rankings";
import { recentReposFetchedAt } from "@/lib/recent-repos";
import { repoMetadataFetchedAt } from "@/lib/repo-metadata";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

// status/route.ts inlines this constant; replicate locally rather than reach
// into that file (it isn't exported there).
const RANKINGS_STALE_THRESHOLD_MS = 12 * 60 * 60 * 1000;

interface AdminStatsResponse {
  ok: true;
  rateLimit: {
    remaining: number | null;
    limit: number | null;
    resetAt: string | null;
  };
  staleSignals: {
    scraper: boolean;
    deltas: boolean;
    hotCollections: boolean;
    recentRepos: boolean;
    repoMetadata: boolean;
    collectionRankings: boolean;
    worstAgeSeconds: number | null;
    lastFetchedAt: string | null;
  };
  diskUsage: {
    hiddenDataBytes: number;
    publicDataBytes: number;
    totalBytes: number;
  };
}

interface AdminStatsErrorResponse {
  ok: false;
  error: string;
  reason?: string;
}

function ageMs(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Date.now() - t;
}

async function fetchRateLimit(): Promise<AdminStatsResponse["rateLimit"]> {
  const fallback = { remaining: null, limit: null, resetAt: null };
  const result = await githubFetch("/rate_limit");
  if (!result || !result.response.ok) return fallback;
  try {
    const data = (await result.response.json()) as {
      resources?: { core?: { remaining?: number; limit?: number; reset?: number } };
    };
    const core = data.resources?.core;
    if (!core) return fallback;
    const remaining = typeof core.remaining === "number" ? core.remaining : null;
    const limit = typeof core.limit === "number" ? core.limit : null;
    const resetAt =
      typeof core.reset === "number"
        ? new Date(core.reset * 1000).toISOString()
        : null;
    return { remaining, limit, resetAt };
  } catch {
    return fallback;
  }
}

// APP-16: cache the recursive size walk per directory for 60s in module
// memory. The admin dashboard polls this on every refresh; .data/ holds
// growing JSONL/log files so an unbounded recursive lstat over thousands
// of entries was the dominant cost of the admin/stats endpoint.
const DIR_SIZE_TTL_MS = 60_000;
const dirSizeCache = new Map<string, { value: number; expiresAt: number }>();

async function dirSizeBytes(absDir: string): Promise<number> {
  const now = Date.now();
  const cached = dirSizeCache.get(absDir);
  if (cached && cached.expiresAt > now) return cached.value;
  const value = await dirSizeBytesUncached(absDir);
  dirSizeCache.set(absDir, { value, expiresAt: now + DIR_SIZE_TTL_MS });
  return value;
}

async function dirSizeBytesUncached(absDir: string): Promise<number> {
  let total = 0;
  let names: string[] = [];
  try {
    names = await fs.readdir(absDir);
  } catch {
    // Missing dir or permission error — treat as 0 bytes.
    return 0;
  }
  for (const name of names) {
    const full = path.join(absDir, name);
    let stat;
    try {
      stat = await fs.lstat(full);
    } catch {
      continue;
    }
    try {
      if (stat.isSymbolicLink()) {
        // Skip symlinks — don't follow, don't count target size.
        continue;
      }
      if (stat.isDirectory()) {
        total += await dirSizeBytes(full);
      } else if (stat.isFile()) {
        total += stat.size;
      }
    } catch {
      // Per-entry failure shouldn't tank the whole walk.
      continue;
    }
  }
  return total;
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<AdminStatsResponse | AdminStatsErrorResponse>> {
  const deny = adminAuthFailureResponse(verifyAdminAuth(request));
  if (deny) return deny as NextResponse<AdminStatsErrorResponse>;

  try {
    const [rateLimit, hiddenDataBytes, publicDataBytes] = await Promise.all([
      fetchRateLimit(),
      dirSizeBytes(path.join(process.cwd(), ".data")),
      dirSizeBytes(path.join(process.cwd(), "data")),
    ]);

    const scraperAge = ageMs(lastFetchedAt);
    const deltasAge = ageMs(deltasComputedAt);
    const hotCollectionsAge = ageMs(hotCollectionsFetchedAt);
    const recentReposAge = ageMs(recentReposFetchedAt);
    const repoMetadataAge = ageMs(repoMetadataFetchedAt);
    const collectionRankingsAge = ageMs(collectionRankingsFetchedAt);

    const scraperStale =
      scraperAge === null || scraperAge > FAST_DATA_STALE_THRESHOLD_MS;
    const deltasStale =
      deltasAge === null || deltasAge > FAST_DATA_STALE_THRESHOLD_MS;
    const hotCollectionsStale =
      hotCollectionsAge === null ||
      hotCollectionsAge > FAST_DATA_STALE_THRESHOLD_MS;
    const recentReposStale =
      recentReposAge === null || recentReposAge > FAST_DATA_STALE_THRESHOLD_MS;
    const repoMetadataStale =
      repoMetadataAge === null ||
      repoMetadataAge > FAST_DATA_STALE_THRESHOLD_MS;
    const collectionRankingsStale =
      collectionRankingsAge === null ||
      collectionRankingsAge > RANKINGS_STALE_THRESHOLD_MS;

    const ageCandidates = [
      scraperAge,
      deltasAge,
      hotCollectionsAge,
      recentReposAge,
      repoMetadataAge,
      collectionRankingsAge,
    ].filter((age): age is number => age !== null);
    const worstAgeSeconds =
      ageCandidates.length > 0
        ? Math.floor(Math.max(...ageCandidates) / 1000)
        : null;

    const body: AdminStatsResponse = {
      ok: true,
      rateLimit,
      staleSignals: {
        scraper: scraperStale,
        deltas: deltasStale,
        hotCollections: hotCollectionsStale,
        recentRepos: recentReposStale,
        repoMetadata: repoMetadataStale,
        collectionRankings: collectionRankingsStale,
        worstAgeSeconds,
        lastFetchedAt: lastFetchedAt ?? null,
      },
      diskUsage: {
        hiddenDataBytes,
        publicDataBytes,
        totalBytes: hiddenDataBytes + publicDataBytes,
      },
    };

    return NextResponse.json(body, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
