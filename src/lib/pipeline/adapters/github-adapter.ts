// StarScreener — Real GitHub REST API adapter.
//
// Implements the GitHubAdapter contract using native fetch. Keeps a running
// view of the rate limit from response headers so the orchestrator can back
// off proactively. All errors are swallowed and logged; the caller receives
// null or a safe default instead of exceptions.

import type {
  GitHubAdapter,
  GitHubRepoRaw,
  GitHubReleaseRaw,
} from "../types";
import { posthogCapture } from "@/lib/analytics/posthog";
import {
  GitHubTokenPoolEmptyError,
  GitHubTokenPoolExhaustedError,
  createGitHubTokenPool,
  getGitHubTokenPool,
  parseRateLimitHeaders,
  redactToken,
  type GitHubTokenPool,
} from "@/lib/github-token-pool";
// Phase 2C: per-source circuit breaker. Wrapped around request() so a
// flapping GitHub API doesn't keep getting hit and an OPEN breaker
// short-circuits before we burn quota on requests we know will fail.
import { sourceHealthTracker } from "@/lib/source-health-tracker";

const GITHUB_API = "https://api.github.com";
const FETCH_TIMEOUT_MS = 10_000;

const BASE_HEADERS: Record<string, string> = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "TrendingRepo",
};

/**
 * AbortSignal that fires after `ms`. Duplicates the helper already in
 * social-adapters.ts / nitter-adapter.ts; H2-2 consolidates all four into
 * a shared `src/lib/external-fetch.ts` wrapper. Local copy kept here so
 * the Phase 2 P-118 resilience patch (F-RES-004) is a contained diff.
 */
function timeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  type TimeoutFn = (ms: number) => AbortSignal;
  const native = (AbortSignal as unknown as { timeout?: TimeoutFn }).timeout;
  if (typeof native === "function") {
    return { signal: native.call(AbortSignal, ms), clear: () => {} };
  }
  const controller = new AbortController();
  const handle = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(handle),
  };
}

interface RateLimitState {
  remaining: number | null;
  /** ISO 8601 string; null if unknown. */
  reset: string | null;
}

export class GitHubApiAdapter implements GitHubAdapter {
  public readonly id = "github" as const;

  /**
   * Token pool — shared singleton in production, but constructor allows an
   * override for tests. When `opts.token` is passed (legacy path), we wrap it
   * in a one-token throwaway pool so the new request flow stays uniform.
   *
   * The pool's per-token quota tracking supersedes the single
   * `rateLimit` cache that used to live on this class. We keep the field
   * around for `getRateLimit()` so observers see the most recent header
   * snapshot from whichever token was used last.
   */
  private readonly pool: GitHubTokenPool;
  private rateLimit: RateLimitState = { remaining: null, reset: null };

  constructor(opts: { token?: string; pool?: GitHubTokenPool } = {}) {
    if (opts.pool) {
      this.pool = opts.pool;
    } else if (opts.token) {
      // Wrap the legacy single-token path so callers that still pass
      // `{ token }` keep working. The pool exists per-instance in this
      // case (no cross-instance sharing), which matches the prior
      // behaviour where each adapter held its own token.
      this.pool = createGitHubTokenPool({
        env: { GITHUB_TOKEN: opts.token },
      });
    } else {
      this.pool = getGitHubTokenPool();
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async fetchRepo(fullName: string): Promise<GitHubRepoRaw | null> {
    const path = `/repos/${fullName}`;
    const res = await this.request(path);
    if (!res) return null;
    if (res.status === 404) return null;
    if (!res.ok) {
      console.error(
        `[github-adapter] fetchRepo ${fullName} failed: ${res.status} ${res.statusText}`,
      );
      return null;
    }
    try {
      const data = (await res.json()) as GitHubRepoRaw;
      return data;
    } catch (err) {
      console.error(`[github-adapter] fetchRepo ${fullName} parse error`, err);
      return null;
    }
  }

  async fetchLatestRelease(
    fullName: string,
  ): Promise<GitHubReleaseRaw | null> {
    const path = `/repos/${fullName}/releases/latest`;
    const res = await this.request(path);
    if (!res) return null;
    // Repos with no release return 404 — that's a normal condition.
    if (res.status === 404) return null;
    if (!res.ok) {
      console.error(
        `[github-adapter] fetchLatestRelease ${fullName} failed: ${res.status} ${res.statusText}`,
      );
      return null;
    }
    try {
      const data = (await res.json()) as GitHubReleaseRaw;
      return data;
    } catch (err) {
      console.error(
        `[github-adapter] fetchLatestRelease ${fullName} parse error`,
        err,
      );
      return null;
    }
  }

  async fetchContributorCount(fullName: string): Promise<number> {
    const path = `/repos/${fullName}/contributors?per_page=1&anon=true`;
    const res = await this.request(path);
    if (!res) return 0;
    if (res.status === 404) return 0;
    if (!res.ok) {
      console.error(
        `[github-adapter] fetchContributorCount ${fullName} failed: ${res.status} ${res.statusText}`,
      );
      return 0;
    }

    // Prefer the Link header's rel="last" page number — that's the total
    // count when per_page=1.
    const link = res.headers.get("link");
    const lastPage = parseLastPageFromLink(link);
    if (lastPage !== null) {
      // Drain the body to free the connection.
      try {
        await res.text();
      } catch {
        // ignore
      }
      return lastPage;
    }

    // No Link header means there's only a single page — count its entries.
    try {
      const data = (await res.json()) as unknown[];
      return Array.isArray(data) ? data.length : 0;
    } catch (err) {
      console.error(
        `[github-adapter] fetchContributorCount ${fullName} parse error`,
        err,
      );
      return 0;
    }
  }

  async getRateLimit(): Promise<{ remaining: number; reset: string } | null> {
    const res = await this.request("/rate_limit");
    if (!res || !res.ok) {
      if (res) {
        console.error(
          `[github-adapter] getRateLimit failed: ${res.status} ${res.statusText}`,
        );
      }
      // Fall back to our cached header view if we have one.
      if (
        this.rateLimit.remaining !== null &&
        this.rateLimit.reset !== null
      ) {
        return {
          remaining: this.rateLimit.remaining,
          reset: this.rateLimit.reset,
        };
      }
      return null;
    }
    try {
      const data = (await res.json()) as {
        rate?: { remaining?: number; reset?: number };
      };
      const remaining = data.rate?.remaining ?? 0;
      const resetEpoch = data.rate?.reset ?? 0;
      const reset = new Date(resetEpoch * 1000).toISOString();
      this.rateLimit = { remaining, reset };
      return { remaining, reset };
    } catch (err) {
      console.error("[github-adapter] getRateLimit parse error", err);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private buildHeaders(token: string | null): Record<string, string> {
    const headers: Record<string, string> = { ...BASE_HEADERS };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  /**
   * Issues a GET against the GitHub API. Returns the Response on success
   * (including non-2xx responses the caller may want to inspect) or null on
   * network error / rate-limit block. Never throws.
   *
   * Retries up to 2 extra times on 429 and 5xx responses with exponential
   * backoff (1s, 2s). Logs each fetch with the current rate-limit remaining
   * count for observability.
   *
   * Each attempt reads a fresh token from the pool so a 429/5xx retry can
   * land on a different PAT — exactly the behaviour we want when the cause
   * was secondary-rate-limit on the previous token.
   */
  private async request(path: string): Promise<Response | null> {
    // Circuit breaker short-circuit BEFORE any work — saves quota on a
    // known-flapping upstream. Breaker reopens after the cooldown so this
    // is auto-healing (no operator action required for transient outages).
    if (sourceHealthTracker.isOpen("github")) {
      console.warn(
        `[github-adapter] breaker OPEN for source 'github' — short-circuiting ${path}`,
      );
      return null;
    }

    const maxAttempts = 3; // 1 original + 2 retries
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Pull a token per attempt so retries can fail over to a healthy PAT.
      // An exhausted pool surfaces as a hard error — we do not silently
      // drop to unauthenticated requests because the operator needs to
      // know they need to rotate / add tokens.
      let token: string | null = null;
      try {
        token = this.pool.getNextToken();
      } catch (err) {
        if (err instanceof GitHubTokenPoolEmptyError) {
          // No tokens at all — fall through to an unauthenticated call.
          // This preserves dev-machine behaviour where someone runs the
          // adapter without a PAT and accepts the 60/hr cap.
          token = null;
        } else if (err instanceof GitHubTokenPoolExhaustedError) {
          console.warn(
            `[github-adapter] every PAT in the pool is rate-limited; refusing ${path}. ${err.message}`,
          );
          return null;
        } else {
          throw err;
        }
      }

      let res: Response;
      const { signal, clear } = timeoutSignal(FETCH_TIMEOUT_MS);
      try {
        res = await fetch(`${GITHUB_API}${path}`, {
          method: "GET",
          headers: this.buildHeaders(token),
          signal,
        });
      } catch (err) {
        console.error(
          `[github-adapter] network error for ${path} (attempt ${attempt + 1}/${maxAttempts})`,
          err,
        );
        if (attempt < maxAttempts - 1) {
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        // Final attempt failed — feed the breaker so 5 consecutive net
        // errors flip it to OPEN.
        sourceHealthTracker.recordFailure(
          "github",
          err instanceof Error ? err.message : String(err),
        );
        return null;
      } finally {
        clear();
      }

      this.updateRateLimit(res, token);
      const remaining =
        this.rateLimit.remaining === null ? "?" : String(this.rateLimit.remaining);
      const tokenLabel = token ? redactToken(token) : "unauth";
      console.log(`[github] GET ${path} tok=${tokenLabel} rl=${remaining}`);

      void posthogCapture("github_api_call", {
        distinct_id: "github-pool",
        tokenLabel,
        remaining: this.rateLimit.remaining,
        reset_in_sec: this.rateLimit.reset
          ? Math.max(
              0,
              Math.floor(new Date(this.rateLimit.reset).getTime() / 1000) -
                Math.floor(Date.now() / 1000),
            )
          : null,
        status: res.status,
        path,
        method: "GET",
      });

      // Retry on transient errors. 403 with remaining=0 is a rate limit on
      // the token we just used — the pool will skip it on the next attempt
      // because we recorded it via updateRateLimit().
      const isServerError = res.status >= 500 && res.status < 600;
      const isTooManyRequests = res.status === 429;
      if ((isServerError || isTooManyRequests) && attempt < maxAttempts - 1) {
        const backoff = 1000 * 2 ** attempt;
        console.warn(
          `[github-adapter] ${res.status} on ${path}, retrying in ${backoff}ms`,
        );
        await sleep(backoff);
        continue;
      }

      // Feed the breaker. 4xx responses (e.g. 404 for a renamed repo) count
      // as success because GitHub is responding correctly — only 5xx and
      // unhandled 429 indicate upstream trouble.
      if (isServerError || isTooManyRequests) {
        sourceHealthTracker.recordFailure("github", `HTTP ${res.status}`);
      } else {
        sourceHealthTracker.recordSuccess("github");
      }
      return res;
    }

    // Exhausted retries — record failure and return null so caller gets a
    // safe failure (avoids double-counting in the loop above).
    sourceHealthTracker.recordFailure("github", "exhausted retries");
    return null;
  }

  /**
   * Records the response's rate-limit headers BOTH on the per-instance
   * `rateLimit` cache (for `getRateLimit()` callers) and on the pool entry
   * for the token that issued the request. Unauthenticated calls (token =
   * null) skip the pool update — there's no per-token state to mutate.
   */
  private updateRateLimit(res: Response, token: string | null): void {
    const parsed = parseRateLimitHeaders(res.headers);
    if (parsed === null) return;
    this.rateLimit.remaining = parsed.remaining;
    this.rateLimit.reset = new Date(parsed.resetUnixSec * 1000).toISOString();
    if (token) {
      this.pool.recordRateLimit(token, parsed.remaining, parsed.resetUnixSec);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse the GitHub Link header to extract the `rel="last"` page number.
 * Returns null if the header is missing or doesn't contain a last link.
 *
 * Example header value:
 *   <https://api.github.com/repositories/1/contributors?page=2>; rel="next",
 *   <https://api.github.com/repositories/1/contributors?page=42>; rel="last"
 */
export function parseLastPageFromLink(link: string | null): number | null {
  if (!link) return null;
  const parts = link.split(",");
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (!match) continue;
    const url = match[1];
    const rel = match[2];
    if (rel !== "last") continue;
    const pageMatch = url.match(/[?&]page=(\d+)/);
    if (!pageMatch) return null;
    const n = Number.parseInt(pageMatch[1], 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
