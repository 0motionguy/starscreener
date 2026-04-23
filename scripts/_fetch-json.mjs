export const DEFAULT_RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export class HttpStatusError extends Error {
  constructor(response, url, bodyText = "") {
    super(
      `HTTP ${response.status} ${response.statusText}${url ? ` - ${url}` : ""}${bodyText ? ` - ${bodyText.slice(0, 300)}` : ""}`,
    );
    this.name = "HttpStatusError";
    this.status = response.status;
    this.statusText = response.statusText;
  }
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function parseRetryAfterMs(value, nowMs = Date.now()) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const trimmed = value.trim();
  const seconds = Number.parseFloat(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1000);
  }
  const dateMs = Date.parse(trimmed);
  if (!Number.isFinite(dateMs)) return null;
  return Math.max(0, dateMs - nowMs);
}

function retryDelayFor({ response, attempt, retryDelayMs }) {
  const retryAfterMs = response
    ? parseRetryAfterMs(response.headers.get("retry-after"))
    : null;
  const scheduledDelayMs = retryDelayMs * attempt;
  return Math.max(scheduledDelayMs, retryAfterMs ?? 0);
}

export async function fetchWithTimeout(
  url,
  { fetchImpl = fetch, timeoutMs = 15_000, ...init } = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJsonWithRetry(
  url,
  {
    attempts = 3,
    retryStatuses = DEFAULT_RETRY_STATUSES,
    retryDelayMs = 500,
    timeoutMs = 15_000,
    fetchImpl = fetch,
    ...init
  } = {},
) {
  let lastErr;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetchWithTimeout(url, {
        ...init,
        fetchImpl,
        timeoutMs,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new HttpStatusError(res, url, text);
        if (retryStatuses.has(res.status) && attempt < attempts) {
          lastErr = err;
          await sleep(retryDelayFor({ response: res, attempt, retryDelayMs }));
          continue;
        }
        throw err;
      }

      return res.json();
    } catch (err) {
      lastErr = err;
      if (err instanceof HttpStatusError && !retryStatuses.has(err.status)) {
        throw err;
      }
      if (attempt < attempts) {
        await sleep(retryDelayFor({ attempt, retryDelayMs }));
        continue;
      }
      throw err;
    }
  }

  throw lastErr ?? new Error(`fetchJsonWithRetry: unknown failure - ${url}`);
}
