import { Agent, fetch as undiciFetch } from 'undici';
import { RateLimitQuarantineError, TransientHttpError } from './errors.js';
import type { HttpClient, HttpOptions, RedisHandle } from './types.js';
import {
  parseRateLimitHeaders,
  quarantine,
  recordRateLimit,
} from './util/github-token-pool.js';

const DEFAULT_AGENT = new Agent({
  connectTimeout: 10_000,
  headersTimeout: 15_000,
  bodyTimeout: 30_000,
  keepAliveTimeout: 60_000,
  keepAliveMaxTimeout: 600_000,
  pipelining: 0,
});

const ETAG_KEY_PREFIX = 'tr:etag:';
const ETAG_BODY_PREFIX = 'tr:etag-body:';
const ETAG_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface HttpClientDeps {
  redis: RedisHandle | null;
  log?: { warn: (m: string) => void; debug?: (m: string) => void };
  fetch?: typeof undiciFetch;
}

export function createHttpClient(deps: HttpClientDeps): HttpClient {
  return {
    async json<T>(url: string, opts: HttpOptions = {}) {
      const { body, etag, cached } = await fetchWithRetry(url, opts, deps);
      let data: T;
      try {
        data = JSON.parse(body) as T;
      } catch (err) {
        throw new TransientHttpError(
          `http.json: response from ${url} was not JSON: ${(err as Error).message}`,
          0,
          { url },
        );
      }
      return { data, cached, etag };
    },
    async text(url: string, opts: HttpOptions = {}) {
      const { body, cached } = await fetchWithRetry(url, opts, deps);
      return { data: body, cached };
    },
  };
}

interface FetchWithRetryResult {
  body: string;
  etag: string | undefined;
  cached: boolean;
}

async function fetchWithRetry(
  url: string,
  opts: HttpOptions,
  deps: HttpClientDeps,
): Promise<FetchWithRetryResult> {
  const useCache = opts.useEtagCache !== false && deps.redis !== null;
  const maxRetries = opts.maxRetries ?? 4;

  let priorEtag: string | null = null;
  if (useCache && deps.redis) {
    priorEtag = await deps.redis.get(ETAG_KEY_PREFIX + url);
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const headers: Record<string, string> = {
      'user-agent': 'trendingrepo-worker/0.1 (+https://trendingrepo.com)',
      accept: 'application/json',
      ...(opts.headers ?? {}),
    };
    if (priorEtag) headers['if-none-match'] = priorEtag;

    let res: Response;
    try {
      res = await (deps.fetch ?? undiciFetch)(url, {
        method: opts.method ?? 'GET',
        headers,
        body:
          typeof opts.body === 'string'
            ? opts.body
            : opts.body
              ? JSON.stringify(opts.body)
              : undefined,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
        dispatcher: DEFAULT_AGENT,
      });
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await sleep(backoffMs(attempt));
      continue;
    }

    const githubToken = publishGithubRateLimit(url, headers, res.headers);
    if (res.status === 401 && githubToken) quarantine(githubToken);

    if (res.status === 304 && priorEtag && deps.redis) {
      const cachedBody = await deps.redis.get(ETAG_BODY_PREFIX + url);
      if (cachedBody !== null) {
        return { body: cachedBody, etag: priorEtag, cached: true };
      }
      priorEtag = null;
      continue;
    }

    if (res.status === 429) {
      const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
      if (attempt < maxRetries) {
        await sleep(Math.min(retryAfter ?? backoffMs(attempt), 60_000));
        continue;
      }
      throw new RateLimitQuarantineError(
        `http: 429 Too Many Requests (no retries left) for ${url}`,
        { url, attempt },
      );
    }

    if (res.status >= 500 && res.status < 600) {
      if (attempt < maxRetries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new TransientHttpError(
        `http: ${res.status} ${res.statusText} for ${url}`,
        res.status,
        { url, attempt },
      );
    }

    if (!res.ok) {
      throw new TransientHttpError(
        `http: ${res.status} ${res.statusText} for ${url}`,
        res.status,
        { url },
      );
    }

    const body = await res.text();
    const newEtag = res.headers.get('etag') ?? undefined;
    if (useCache && newEtag && deps.redis) {
      await Promise.all([
        deps.redis.set(ETAG_KEY_PREFIX + url, newEtag, { ex: ETAG_TTL_SECONDS }),
        deps.redis.set(ETAG_BODY_PREFIX + url, body, { ex: ETAG_TTL_SECONDS }),
      ]);
    }
    return { body, etag: newEtag, cached: false };
  }
  throw new TransientHttpError(`http: exhausted retries for ${url}`, 0, { url, maxRetries });
}

function publishGithubRateLimit(
  url: string,
  reqHeaders: Record<string, string>,
  resHeaders: Headers,
): string | null {
  // Only publish for github.com — the pool's recordRateLimit also guards
  // against pool-foreign tokens, but cheap host check avoids parsing URLs
  // for every non-GitHub call.
  if (!url.startsWith('https://api.github.com')) return null;
  const auth = reqHeaders.authorization ?? reqHeaders.Authorization;
  if (typeof auth !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  if (!match) return null;
  const token = match[1]?.trim();
  if (!token) return null;
  const rl = parseRateLimitHeaders(resHeaders);
  if (rl) {
    const resource = rl.resource ??
      (url === 'https://api.github.com/graphql'
        ? 'graphql'
        : url.startsWith('https://api.github.com/search/')
          ? 'search'
          : 'core');
    recordRateLimit(token, rl.remaining, rl.resetUnixSec, resource);
  }
  return token;
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

function backoffMs(attempt: number): number {
  const base = 200 * 2 ** attempt;
  const jitter = Math.random() * 200;
  return Math.min(base + jitter, 30_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
