// Pool-aware GitHub fetch helper for one-off / on-demand callers.
//
// The ingest pipeline drives its requests through the GitHubApiAdapter
// (src/lib/pipeline/adapters/github-adapter.ts), which already routes every
// call through the token pool, parses rate-limit headers, retries on 5xx,
// and feeds the source-health breaker.
//
// On-demand callers (admin dashboard, compare page, user-profile fetch, repo
// homepage enrichment) don't sit inside that adapter — historically each one
// reached for `process.env.GITHUB_TOKEN` directly, burning quota outside the
// pool's accounting. This helper exists so those callers can get the same
// pool-aware behaviour with one import:
//
//   const res = await githubFetch("/repos/foo/bar");
//
// Behaviour:
//   - Picks a fresh token from the pool per attempt (max 2 attempts) so a
//     retry lands on a different PAT.
//   - Records `x-ratelimit-remaining` / `x-ratelimit-reset` after every
//     response so the pool stays current.
//   - Quarantines a token on 401 (invalid/revoked) so the same PAT doesn't
//     keep failing every request until restart.
//   - Falls through to an unauthenticated request when the pool is empty
//     (preserves dev-machine behaviour without a PAT, capped at 60 req/hr).
//   - Returns null on persistent network errors so callers can branch on
//     success without try/catch noise.

import * as Sentry from "@sentry/nextjs";

import { posthogCapture } from "./analytics/posthog";
import {
  GithubInvalidTokenError,
  GithubPoolExhaustedError,
  GithubRateLimitError,
  GithubRecoverableError,
} from "./errors";
import {
  GitHubTokenPoolEmptyError,
  GitHubTokenPoolExhaustedError,
  getGitHubTokenPool,
  parseRateLimitHeaders,
  redactToken,
  type GitHubTokenPool,
} from "./github-token-pool";
import {
  githubKeyFingerprint,
  quarantineKey,
  recordGithubCall,
} from "./pool/github-telemetry";

const GITHUB_API = "https://api.github.com";
const DEFAULT_TIMEOUT_MS = 15_000;
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

export interface GithubFetchOptions {
  /** HTTP method. Defaults to GET. */
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  /** Extra headers to merge on top of the default Accept + Auth headers. */
  headers?: Record<string, string>;
  /** Body for POST/PATCH. */
  body?: BodyInit | null;
  /** Override timeout in ms. */
  timeoutMs?: number;
  /** Optional pool injection — only used in tests. */
  pool?: GitHubTokenPool;
  /** Next.js fetch cache hint forwarded to `fetch`. */
  next?: { revalidate?: number; tags?: string[] };
  /** Fetch cache directive. Defaults to "no-store" for live data. */
  cache?: RequestCache;
  /** AbortSignal from the caller (composed with the internal timeout). */
  signal?: AbortSignal;
  /** Logical operation name for Redis pool telemetry. */
  operation?: string;
}

export interface GithubFetchResult {
  /** The fetch Response. Caller is responsible for `.json()` / `.text()`. */
  response: Response;
  /** Redacted prefix of the PAT used (or "unauth" if no token). For logs. */
  tokenLabel: string;
}

/**
 * Pool-aware GitHub fetch. Resolves the URL against api.github.com if it
 * starts with "/", otherwise uses it verbatim. Returns null on persistent
 * network errors or when the pool is fully exhausted/quarantined; returns
 * the Response otherwise (including non-2xx — caller decides).
 */
export async function githubFetch(
  pathOrUrl: string,
  options: GithubFetchOptions = {},
): Promise<GithubFetchResult | null> {
  const url = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `${GITHUB_API}${pathOrUrl}`;
  const pool = options.pool ?? getGitHubTokenPool();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const method = options.method ?? "GET";
  const operation = options.operation ?? operationFromPath(pathOrUrl, method);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let token: string | null = null;
    try {
      token = pool.getNextToken();
    } catch (err) {
      if (err instanceof GitHubTokenPoolEmptyError) {
        // Dev path: no PATs configured — fall through to unauthenticated.
        token = null;
      } else if (err instanceof GitHubTokenPoolExhaustedError) {
        const wrapped = new GithubPoolExhaustedError(err.message, {
          allQuarantined: err.allQuarantined,
          resetsAtUnixSec: err.resetsAtUnixSec,
          operation,
        });
        Sentry.captureException(wrapped, {
          tags: { pool: "github", alert: "github-pool-exhausted" },
        });
        void alertOps("github-pool-exhausted", wrapped.metadata);
        console.warn(
          `[github-fetch] pool exhausted on ${method} ${pathOrUrl}: ${err.message}`,
        );
        return null;
      } else {
        throw err;
      }
    }

    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "starscreener-fetch",
      ...options.headers,
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const startedAt = Date.now();
    if (options.signal) {
      if (options.signal.aborted) ac.abort();
      else options.signal.addEventListener("abort", () => ac.abort(), { once: true });
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: options.body,
        signal: ac.signal,
        cache: options.cache ?? "no-store",
        ...(options.next ? { next: options.next } : {}),
      });
    } catch (err) {
      clearTimeout(timer);
      await recordGithubCall({
        keyFingerprint: githubKeyFingerprint(token),
        statusCode: 0,
        rateLimitRemaining: null,
        rateLimitReset: null,
        responseTimeMs: Date.now() - startedAt,
        operation,
        success: false,
      });
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS.at(-1)!);
        continue;
      }
      const wrapped = new GithubRecoverableError("GitHub network error", {
        operation,
        path: pathOrUrl,
        message: err instanceof Error ? err.message : String(err),
      });
      Sentry.captureException(wrapped, {
        tags: { pool: "github", alert: "github-pool-network" },
      });
      console.warn(
        `[github-fetch] network error on ${method} ${pathOrUrl}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
    clearTimeout(timer);

    const headerLimits = parseRateLimitHeaders(res.headers);
    if (token && headerLimits) {
      pool.recordRateLimit(token, headerLimits.remaining, headerLimits.resetUnixSec);
    }
    await recordGithubCall({
      keyFingerprint: githubKeyFingerprint(token),
      statusCode: res.status,
      rateLimitRemaining: headerLimits?.remaining ?? null,
      rateLimitReset: headerLimits?.resetUnixSec ?? null,
      responseTimeMs: Date.now() - startedAt,
      operation,
      success: res.ok,
    });

    // 401 → token is invalid; quarantine and retry with a different PAT.
    if (res.status === 401 && token) {
      pool.quarantine(token);
      await quarantineKey({
        keyFingerprint: githubKeyFingerprint(token),
        reason: "invalid_token",
        untilTimestamp: Math.floor((Date.now() + 24 * 60 * 60 * 1000) / 1000),
      });
      Sentry.captureException(
        new GithubInvalidTokenError("GitHub token rejected with 401", {
          operation,
          statusCode: res.status,
        }),
        { tags: { pool: "github", alert: "github-pool-key-invalid" } },
      );
      console.warn(
        `[github-fetch] 401 on ${method} ${pathOrUrl} tok=${redactToken(token)} — quarantined`,
      );
      if (attempt < MAX_ATTEMPTS - 1) {
        continue;
      }
    }

    // 403/429 with rate-limit reset header → pool already updated above;
    // retry once with a fresh token.
    const isRateLimited =
      (res.status === 403 || res.status === 429) &&
      headerLimits !== null &&
      headerLimits.remaining <= 0;
    if (isRateLimited && token) {
      await quarantineKey({
        keyFingerprint: githubKeyFingerprint(token),
        reason: "rate_limit",
        untilTimestamp: headerLimits.resetUnixSec,
      });
      Sentry.captureException(
        new GithubRateLimitError("GitHub token hit rate limit", {
          operation,
          statusCode: res.status,
          resetUnixSec: headerLimits.resetUnixSec,
        }),
        { tags: { pool: "github", alert: "github-pool-rate-limit" } },
      );
    } else if (res.status === 403 && token) {
      await quarantineKey({
        keyFingerprint: githubKeyFingerprint(token),
        reason: "forbidden",
        untilTimestamp: Math.floor((Date.now() + 24 * 60 * 60 * 1000) / 1000),
      });
      Sentry.captureException(
        new GithubInvalidTokenError("GitHub token rejected with 403", {
          operation,
          statusCode: res.status,
        }),
        { tags: { pool: "github", alert: "github-pool-key-invalid" } },
      );
    }
    if ((res.status === 403 || res.status === 429) && attempt < MAX_ATTEMPTS - 1) {
      console.warn(
        `[github-fetch] ${res.status} on ${method} ${pathOrUrl} tok=${
          token ? redactToken(token) : "unauth"
        } — retrying with fresh token`,
      );
      continue;
    }
    if (res.status >= 500 && res.status < 600 && attempt < MAX_ATTEMPTS - 1) {
      await quarantineKey({
        keyFingerprint: githubKeyFingerprint(token),
        reason: "5xx",
        untilTimestamp: Math.floor((Date.now() + 60) / 1000),
      });
      await sleep(RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS.at(-1)!);
      continue;
    }
    if (res.status >= 500 && res.status < 600) {
      const wrapped = new GithubRecoverableError("GitHub server error", {
        operation,
        statusCode: res.status,
      });
      Sentry.captureException(wrapped, {
        tags: { pool: "github", alert: "github-pool-5xx" },
      });
    }

    void posthogCapture("github_api_call", {
      distinct_id: "github-pool",
      tokenLabel: token ? redactToken(token) : "unauth",
      remaining: headerLimits?.remaining ?? null,
      reset_in_sec: headerLimits
        ? Math.max(0, headerLimits.resetUnixSec - Math.floor(Date.now() / 1000))
        : null,
      status: res.status,
      path: pathOrUrl.startsWith("http") ? new URL(pathOrUrl).pathname : pathOrUrl,
      method,
    });

    return {
      response: res,
      tokenLabel: token ? redactToken(token) : "unauth",
    };
  }

  return null;
}

function operationFromPath(pathOrUrl: string, method: string): string {
  const pathname = pathOrUrl.startsWith("http")
    ? new URL(pathOrUrl).pathname
    : pathOrUrl.split("?")[0] || "/";
  const slug = pathname
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return `${method.toLowerCase()}_${slug || "github"}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function alertOps(
  event: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const url = process.env.OPS_ALERT_WEBHOOK?.trim();
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        source: "github",
        metadata,
        at: new Date().toISOString(),
      }),
    });
  } catch {
    // Alert failures must not break the caller handling the original outage.
  }
}
