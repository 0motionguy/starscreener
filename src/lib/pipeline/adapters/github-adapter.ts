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

const GITHUB_API = "https://api.github.com";
const FETCH_TIMEOUT_MS = 10_000;

const BASE_HEADERS: Record<string, string> = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "StarScreener",
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

  private readonly token: string | undefined;
  private rateLimit: RateLimitState = { remaining: null, reset: null };

  constructor(opts: { token?: string } = {}) {
    this.token = opts.token ?? process.env.GITHUB_TOKEN ?? undefined;
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

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { ...BASE_HEADERS };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
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
   */
  private async request(path: string): Promise<Response | null> {
    if (this.isRateLimited()) {
      console.warn(
        `[github-adapter] rate limited — refusing request to ${path} until ${this.rateLimit.reset}`,
      );
      return null;
    }

    const maxAttempts = 3; // 1 original + 2 retries
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let res: Response;
      const { signal, clear } = timeoutSignal(FETCH_TIMEOUT_MS);
      try {
        res = await fetch(`${GITHUB_API}${path}`, {
          method: "GET",
          headers: this.buildHeaders(),
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
        return null;
      } finally {
        clear();
      }

      this.updateRateLimit(res);
      const remaining =
        this.rateLimit.remaining === null ? "?" : String(this.rateLimit.remaining);
      console.log(`[github] GET ${path} rl=${remaining}`);

      // Retry on transient errors. 403 with remaining=0 is a rate limit, not
      // a retryable error — let isRateLimited() handle it on the next call.
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

      return res;
    }

    // Exhausted retries — return null so caller gets a safe failure.
    return null;
  }

  private updateRateLimit(res: Response): void {
    const remainingStr = res.headers.get("x-ratelimit-remaining");
    const resetStr = res.headers.get("x-ratelimit-reset");
    if (remainingStr !== null) {
      const parsed = Number.parseInt(remainingStr, 10);
      if (Number.isFinite(parsed)) {
        this.rateLimit.remaining = parsed;
      }
    }
    if (resetStr !== null) {
      const epoch = Number.parseInt(resetStr, 10);
      if (Number.isFinite(epoch)) {
        this.rateLimit.reset = new Date(epoch * 1000).toISOString();
      }
    }
  }

  private isRateLimited(): boolean {
    if (this.rateLimit.remaining === null) return false;
    if (this.rateLimit.remaining > 0) return false;
    if (!this.rateLimit.reset) return false;
    return new Date(this.rateLimit.reset).getTime() > Date.now();
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
