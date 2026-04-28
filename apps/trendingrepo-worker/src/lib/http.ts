import { Agent, fetch as undiciFetch } from 'undici';
import type { HttpClient, HttpOptions, RedisHandle } from './types.js';

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
}

export function createHttpClient(deps: HttpClientDeps): HttpClient {
  return {
    async json<T>(url: string, opts: HttpOptions = {}) {
      const { body, etag, cached } = await fetchWithRetry(url, opts, deps);
      let data: T;
      try {
        data = JSON.parse(body) as T;
      } catch (err) {
        throw new Error(`http.json: response from ${url} was not JSON: ${(err as Error).message}`);
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
      res = await undiciFetch(url, {
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
      throw new Error(`http: 429 Too Many Requests (no retries left) for ${url}`);
    }

    if (res.status >= 500 && res.status < 600) {
      if (attempt < maxRetries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new Error(`http: ${res.status} ${res.statusText} for ${url}`);
    }

    if (!res.ok) {
      throw new Error(`http: ${res.status} ${res.statusText} for ${url}`);
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
  throw new Error(`http: exhausted retries for ${url}`);
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
