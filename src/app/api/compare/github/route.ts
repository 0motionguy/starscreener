// StarScreener — `/api/compare/github` (GitHub-only extras).
//
// Thin wrapper over `fetchCompareBundles`, exposing the rich GitHub bundle
// (commit heatmap, contributors, languages, PR/issue churn, releases) that
// powers the legacy Compare "Code activity side-by-side" section rendered
// under the canonical profile grid at `/compare`.
//
// The canonical compare lives at `/api/compare`; this route is intentionally
// separate because the GitHub bundle is expensive (≈12 API calls per 4-repo
// request, plus occasional `stats/commit_activity` retries) and slow-moving,
// so we cache it far more aggressively (5 min edge / 1 h SWR).
//
// Query contract:
//   - `?repos=owner/name,owner/name,...`
//
// Response shape:
//   { ok: true, fetchedAt: ISO, bundles: CompareRepoBundle[] }
//
// Errors:
//   - 400 "missing_repos"   — no repos provided
//   - 400 "too_many_repos"  — more than MAX_REPOS
//   - 500 "internal_error"  — unexpected throw escaping `fetchCompareBundles`
//     (individual-repo failures are absorbed into `ok:false` bundles, so this
//     is reserved for catastrophic failures of the batch itself)

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import {
  fetchCompareBundles,
  type CompareRepoBundle,
} from "@/lib/github-compare";
import { respondWithSizeGuard } from "@/lib/api/response-size";
import { checkRateLimitAsync } from "@/lib/api/rate-limit";
import { getDataStore } from "@/lib/data-store";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

const MAX_REPOS = 5;
const FULL_NAME_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const RATE_LIMIT_WINDOW_MS = 5 * 60_000;
const RATE_LIMIT_MAX = 10;
const CACHE_KEY_PREFIX = "compare-github:";
const LIVE_COOLDOWN_MS = 5 * 60_000;
const CACHE_MISS_ALERT_THRESHOLD = 0.3;
const CACHE_MISS_ALERT_MIN_SAMPLES = 10;

const liveFetchCooldownUntil = new Map<string, number>();
let cacheStatsWindow = {
  startedAt: 0,
  requests: 0,
  misses: 0,
};

interface CompareGithubOkBody {
  ok: true;
  fetchedAt: string;
  bundles: CompareRepoBundle[];
}

interface CompareGithubErrBody {
  ok: false;
  error: string;
  code: string;
}

function errorResponse(
  code: string,
  message: string,
  status: number,
): NextResponse<CompareGithubErrBody> {
  return NextResponse.json({ ok: false, error: message, code }, { status });
}

function normalizeRepo(repo: string): string {
  return repo.trim().toLowerCase();
}

function canonicalizeRepos(repos: string[]): string[] {
  return Array.from(new Set(repos.map(normalizeRepo))).sort();
}

function cacheKeyForCanonicalRepos(repos: string[]): string {
  return `${CACHE_KEY_PREFIX}${repos.map((r) => r.replace("/", "__")).join("--")}`;
}

function addRateLimitHeaders(response: NextResponse, resetAt: number): NextResponse {
  const retrySec = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  response.headers.set("Retry-After", String(retrySec));
  response.headers.set("X-RateLimit-Limit", String(RATE_LIMIT_MAX));
  response.headers.set("X-RateLimit-Window", String(RATE_LIMIT_WINDOW_MS));
  response.headers.set("X-RateLimit-Reset", String(resetAt));
  return response;
}

function trackCacheWindow(isMiss: boolean): void {
  const now = Date.now();
  if (!cacheStatsWindow.startedAt || now - cacheStatsWindow.startedAt > RATE_LIMIT_WINDOW_MS) {
    cacheStatsWindow = { startedAt: now, requests: 0, misses: 0 };
  }
  cacheStatsWindow.requests += 1;
  if (isMiss) cacheStatsWindow.misses += 1;

  if (cacheStatsWindow.requests < CACHE_MISS_ALERT_MIN_SAMPLES) return;
  const missRate = cacheStatsWindow.misses / cacheStatsWindow.requests;
  if (missRate > CACHE_MISS_ALERT_THRESHOLD) {
    Sentry.captureMessage("/api/compare/github cache miss rate above threshold", {
      level: "warning",
      tags: { route: "api/compare/github" },
      extra: {
        requests: cacheStatsWindow.requests,
        misses: cacheStatsWindow.misses,
        missRate,
        threshold: CACHE_MISS_ALERT_THRESHOLD,
      },
    });
  }
}

export async function GET(request: NextRequest) {
  const rate = await checkRateLimitAsync(request, {
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxRequests: RATE_LIMIT_MAX,
  });
  if (!rate.allowed) {
    return addRateLimitHeaders(
      errorResponse("rate_limited", "Rate limit exceeded", 429),
      rate.resetAt,
    );
  }

  // Use `new URL(request.url)` rather than `request.nextUrl` so the handler
  // stays testable with a plain `Request` (mirrors the canonical route tests).
  const url = new URL(request.url);
  const { searchParams } = url;
  const reposParam = searchParams.get("repos") ?? "";

  const repos = reposParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (repos.length === 0) {
    return errorResponse(
      "missing_repos",
      "Missing required 'repos' parameter",
      400,
    );
  }

  if (repos.length > MAX_REPOS) {
    return errorResponse(
      "too_many_repos",
      `Maximum ${MAX_REPOS} repos per request`,
      400,
    );
  }

  const invalid = repos.filter((n) => !FULL_NAME_RE.test(n));
  if (invalid.length > 0) {
    return errorResponse(
      "invalid_repo",
      `Invalid repo name(s): ${invalid.join(", ")} (expected 'owner/name')`,
      400,
    );
  }

  const canonicalRepos = canonicalizeRepos(repos);
  const canonicalReposParam = canonicalRepos.join(",");
  if (reposParam !== canonicalReposParam) {
    const redirectUrl = new URL(request.url);
    redirectUrl.searchParams.set("repos", canonicalReposParam);
    return NextResponse.redirect(redirectUrl, 307);
  }

  const key = cacheKeyForCanonicalRepos(canonicalRepos);
  const store = getDataStore();

  try {
    const cached = await store.read<CompareRepoBundle[]>(key);
    if (cached.data && Array.isArray(cached.data)) {
      trackCacheWindow(false);
      const body: CompareGithubOkBody = {
        ok: true,
        fetchedAt: new Date().toISOString(),
        bundles: cached.data,
      };
      return respondWithSizeGuard(body, {
        status: 200,
        route: "/api/compare/github",
        arrayKeys: ["bundles"],
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
        },
      });
    }

    trackCacheWindow(true);
    const cooldownUntil = liveFetchCooldownUntil.get(key) ?? 0;
    const cooldownActive = cooldownUntil > Date.now();
    Sentry.addBreadcrumb({
      category: "api.compare.github",
      level: "warning",
      message: "compare/github cache miss",
      data: {
        key,
        repos: canonicalRepos,
        cooldownActive,
      },
    });

    if (cooldownActive) {
      return errorResponse(
        "cache_miss_cooldown",
        "Cache miss cooldown active",
        503,
      );
    }

    liveFetchCooldownUntil.set(key, Date.now() + LIVE_COOLDOWN_MS);
    const bundles = await fetchCompareBundles(canonicalRepos);
    await store.write(key, bundles, { ttlSeconds: 3600 });

    const body: CompareGithubOkBody = {
      ok: true,
      fetchedAt: new Date().toISOString(),
      bundles,
    };
    return respondWithSizeGuard(body, {
      status: 200,
      route: "/api/compare/github",
      arrayKeys: ["bundles"],
      headers: {
        // commit_activity is expensive + slow-changing; lean on the edge cache.
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    });
  } catch (err) {
    console.error("[api:compare/github] unexpected failure", err);
    return errorResponse("internal_error", "Internal error", 500);
  }
}
