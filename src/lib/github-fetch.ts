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

import "server-only";

import * as Sentry from "@sentry/nextjs";

import { posthogCapture } from "./analytics/posthog";
import {
  engineErrorTags,
  EngineError,
  GithubInvalidTokenError,
  GithubPoolExhaustedError,
  GithubRateLimitError,
  GithubRecoverableError,
  OpsAlertFatalError,
  OpsAlertRecoverableError,
} from "./errors";
import { notify, type NotifyResult } from "./notify";
import {
  GitHubTokenPoolEmptyError,
  GitHubTokenPoolExhaustedError,
  getGitHubTokenPool,
  githubRateLimitResourceFromPath,
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
let sentryCaptureException = Sentry.captureException;

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
  /**
   * Whether Redis-backed telemetry must complete before returning.
   * Defaults to true for collectors/admin calls. Latency-sensitive page
   * fallbacks can set this false so telemetry remains best-effort.
   */
  awaitTelemetry?: boolean;
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
  const rateLimitResource = githubRateLimitResourceFromPath(pathOrUrl);
  const awaitTelemetry = options.awaitTelemetry ?? true;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let token: string | null = null;
    try {
      token = pool.getNextToken(rateLimitResource);
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
        sentryCaptureException(wrapped, {
          tags: {
            pool: "github",
            alert: "github-pool-exhausted",
            ...engineErrorTags(wrapped),
          },
        });
        void alertGithubError(wrapped);
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
      await recordGithubCallForFetch(
        {
          keyFingerprint: githubKeyFingerprint(token),
          statusCode: 0,
          rateLimitRemaining: null,
          rateLimitReset: null,
          responseTimeMs: Date.now() - startedAt,
          operation,
          success: false,
        },
        awaitTelemetry,
      );
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS.at(-1)!);
        continue;
      }
      const wrapped = new GithubRecoverableError("GitHub network error", {
        operation,
        path: pathOrUrl,
        message: err instanceof Error ? err.message : String(err),
      });
      sentryCaptureException(wrapped, {
        tags: {
          pool: "github",
          alert: "github-pool-network",
          ...engineErrorTags(wrapped),
        },
      });
      void alertGithubError(wrapped);
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
      pool.recordRateLimit(
        token,
        headerLimits.remaining,
        headerLimits.resetUnixSec,
        headerLimits.resource ?? rateLimitResource,
      );
    }
    await recordGithubCallForFetch(
      {
        keyFingerprint: githubKeyFingerprint(token),
        statusCode: res.status,
        rateLimitRemaining: headerLimits?.remaining ?? null,
        rateLimitReset: headerLimits?.resetUnixSec ?? null,
        responseTimeMs: Date.now() - startedAt,
        operation,
        success: res.ok,
      },
      awaitTelemetry,
    );

    // 401 → token is invalid; quarantine and retry with a different PAT.
    if (res.status === 401 && token) {
      pool.quarantine(token);
      await quarantineKey({
        keyFingerprint: githubKeyFingerprint(token),
        reason: "invalid_token",
        untilTimestamp: Math.floor((Date.now() + 24 * 60 * 60 * 1000) / 1000),
      });
      const wrapped = new GithubInvalidTokenError("GitHub token rejected with 401", {
        operation,
        statusCode: res.status,
      });
      sentryCaptureException(wrapped, {
        tags: {
          pool: "github",
          alert: "github-pool-key-invalid",
          source: "github",
          category: "quarantine",
        },
      });
      void alertGithubError(wrapped);
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
      const wrapped = new GithubRateLimitError("GitHub token hit rate limit", {
        operation,
        statusCode: res.status,
        resetUnixSec: headerLimits.resetUnixSec,
      });
      sentryCaptureException(wrapped, {
        tags: {
          pool: "github",
          alert: "github-pool-rate-limit",
          source: "github",
          category: "quarantine",
        },
      });
      void alertGithubError(wrapped);
    } else if (res.status === 403 && token) {
      await quarantineKey({
        keyFingerprint: githubKeyFingerprint(token),
        reason: "forbidden",
        untilTimestamp: Math.floor((Date.now() + 24 * 60 * 60 * 1000) / 1000),
      });
      sentryCaptureException(
        new GithubInvalidTokenError("GitHub token rejected with 403", {
          operation,
          statusCode: res.status,
        }),
        {
          tags: {
            pool: "github",
            alert: "github-pool-key-invalid",
            source: "github",
            category: "quarantine",
          },
        },
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
      sentryCaptureException(wrapped, {
        tags: {
          pool: "github",
          alert: "github-pool-5xx",
          ...engineErrorTags(wrapped),
        },
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

async function recordGithubCallForFetch(
  params: Parameters<typeof recordGithubCall>[0],
  awaitTelemetry: boolean,
): Promise<void> {
  const telemetry = recordGithubCall(params);
  if (awaitTelemetry) {
    await telemetry;
  } else {
    void telemetry;
  }
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

async function alertGithubError(error: EngineError): Promise<void> {
  let severity: "critical" | "ops";
  let source: string;
  let title: string;
  let idempotencyKey: string;
  if (error instanceof GithubPoolExhaustedError) {
    severity = "critical";
    source = "github.pool-exhausted";
    title = "GitHub token pool exhausted";
    idempotencyKey = source;
  } else if (error instanceof GithubRateLimitError) {
    severity = "critical";
    source = "github.rate-limit";
    title = "GitHub token hit rate limit";
    idempotencyKey = `${source}:${String(error.metadata.resetUnixSec ?? "unknown")}`;
  } else if (error instanceof GithubInvalidTokenError) {
    severity = "ops";
    source = "github.token-invalid";
    title = "GitHub token rejected (invalid/forbidden)";
    idempotencyKey = `${source}:${String(error.metadata.operation ?? "unknown")}:${String(
      error.metadata.statusCode ?? "unknown",
    )}`;
  } else if (error instanceof GithubRecoverableError) {
    severity = "ops";
    source = "github.network-error";
    title = "GitHub network/server error";
    idempotencyKey = `${source}:${String(error.metadata.operation ?? "unknown")}:${String(
      error.metadata.statusCode ?? "network",
    )}`;
  } else {
    severity = "ops";
    source = "github.unknown";
    title = "GitHub engine error";
    idempotencyKey = source;
  }
  const result = await notify({
    severity,
    source,
    title,
    message: error.message,
    context: error.metadata,
    idempotencyKey,
  });
  if (!result.delivered && shouldCaptureGithubNotifyFailure(result)) {
    captureGithubNotifyFailure(error, source, result);
  }
}

function shouldCaptureGithubNotifyFailure(result: NotifyResult): boolean {
  return (
    result.reason === "no_webhook_configured" ||
    result.reason === "post_failed" ||
    result.reason === "post_timeout" ||
    result.reason === "post_threw"
  );
}

function captureGithubNotifyFailure(
  original: EngineError,
  notifySource: string,
  result: NotifyResult,
): void {
  const missingWebhook = result.reason === "no_webhook_configured";
  const failure = missingWebhook
    ? new OpsAlertFatalError("notify blocked: Slack webhook missing", {
        source: "github",
        notifySource,
        notifyReason: result.reason,
        originalError: original.name,
        metadata: original.metadata,
      })
    : new OpsAlertRecoverableError("notify delivery failed", {
        source: "github",
        notifySource,
        notifyReason: result.reason,
        originalError: original.name,
        metadata: original.metadata,
      });

  sentryCaptureException(failure, {
    level: missingWebhook ? "error" : "warning",
    tags: {
      pool: "github",
      alert: missingWebhook
        ? "github-notify-blocked"
        : "github-notify-delivery-failed",
      upstream_source: "github",
      ...engineErrorTags(failure),
    },
    extra: {
      notify: result,
      originalError: {
        name: original.name,
        message: original.message,
        metadata: original.metadata,
      },
    },
  });
}

export function _setGithubFetchSentryForTests(deps: {
  captureException: typeof Sentry.captureException;
}): void {
  sentryCaptureException = deps.captureException;
}

export function _resetGithubFetchSentryForTests(): void {
  sentryCaptureException = Sentry.captureException;
}
