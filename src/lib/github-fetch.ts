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

import { posthogCapture } from "./analytics/posthog";
import {
  GitHubTokenPoolEmptyError,
  GitHubTokenPoolExhaustedError,
  getGitHubTokenPool,
  parseRateLimitHeaders,
  redactToken,
  type GitHubTokenPool,
} from "./github-token-pool";

const GITHUB_API = "https://api.github.com";
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 2;

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

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let token: string | null = null;
    try {
      token = pool.getNextToken();
    } catch (err) {
      if (err instanceof GitHubTokenPoolEmptyError) {
        // Dev path: no PATs configured — fall through to unauthenticated.
        token = null;
      } else if (err instanceof GitHubTokenPoolExhaustedError) {
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
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
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

    // 401 → token is invalid; quarantine and retry with a different PAT.
    if (res.status === 401 && token) {
      pool.quarantine(token);
      console.warn(
        `[github-fetch] 401 on ${method} ${pathOrUrl} tok=${redactToken(token)} — quarantined`,
      );
      if (attempt < MAX_ATTEMPTS - 1) {
        continue;
      }
    }

    // 403/429 with rate-limit reset header → pool already updated above;
    // retry once with a fresh token.
    if ((res.status === 403 || res.status === 429) && attempt < MAX_ATTEMPTS - 1) {
      console.warn(
        `[github-fetch] ${res.status} on ${method} ${pathOrUrl} tok=${
          token ? redactToken(token) : "unauth"
        } — retrying with fresh token`,
      );
      continue;
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
