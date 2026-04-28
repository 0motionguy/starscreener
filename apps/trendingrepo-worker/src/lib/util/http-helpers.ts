// Lightweight HTTP helpers ported from scripts/_fetch-json.mjs. The worker's
// ctx.http.json is the preferred path, but a few enrichment fetchers need
// direct fetch + retry control (custom timeouts, fallback on 404, raw HTML
// responses, etc.) so we keep a minimal undici-backed wrapper here.

import { fetch as undiciFetch } from 'undici';

export const DEFAULT_RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export class HttpStatusError extends Error {
  status: number;
  statusText: string;
  constructor(response: { status: number; statusText: string }, url: string, bodyText = '') {
    super(
      `HTTP ${response.status} ${response.statusText}${url ? ` - ${url}` : ''}${
        bodyText ? ` - ${bodyText.slice(0, 300)}` : ''
      }`,
    );
    this.name = 'HttpStatusError';
    this.status = response.status;
    this.statusText = response.statusText;
  }
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function parseRetryAfterMs(value: string | null | undefined, nowMs = Date.now()): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const trimmed = value.trim();
  const seconds = Number.parseFloat(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1000);
  }
  const dateMs = Date.parse(trimmed);
  if (!Number.isFinite(dateMs)) return null;
  return Math.max(0, dateMs - nowMs);
}

interface FetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

interface FetchOptions extends FetchInit {
  timeoutMs?: number;
}

interface FetchJsonRetryOptions extends FetchOptions {
  attempts?: number;
  retryStatuses?: Set<number>;
  retryDelayMs?: number;
}

export async function fetchWithTimeout(url: string, opts: FetchOptions = {}): Promise<Response> {
  const { timeoutMs = 15_000, ...init } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return (await undiciFetch(url, {
      ...init,
      signal: controller.signal,
    })) as unknown as Response;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJsonWithRetry<T = unknown>(
  url: string,
  opts: FetchJsonRetryOptions = {},
): Promise<T> {
  const {
    attempts = 3,
    retryStatuses = DEFAULT_RETRY_STATUSES,
    retryDelayMs = 500,
    timeoutMs = 15_000,
    ...init
  } = opts;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetchWithTimeout(url, { ...init, timeoutMs });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = new HttpStatusError(res, url, text);
        if (retryStatuses.has(res.status) && attempt < attempts) {
          lastErr = err;
          const retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after'));
          await sleep(Math.max(retryDelayMs * attempt, retryAfterMs ?? 0));
          continue;
        }
        throw err;
      }
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (err instanceof HttpStatusError && !retryStatuses.has(err.status)) {
        throw err;
      }
      if (attempt < attempts) {
        await sleep(retryDelayMs * attempt);
        continue;
      }
      throw err;
    }
  }

  throw lastErr ?? new Error(`fetchJsonWithRetry: unknown failure - ${url}`);
}
