export interface FetchWithTimeoutInit extends RequestInit {
  timeoutMs?: number;
  fetcher?: typeof fetch;
  next?: {
    revalidate?: number;
  };
}

/**
 * Server-side fetch with a hard wall-clock bound. Public market APIs can hang
 * long enough to stall dynamic route renders; callers should catch timeout
 * failures and render the existing honest empty/degraded state.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: FetchWithTimeoutInit = {},
): Promise<Response> {
  const { timeoutMs = 5_000, fetcher = fetch, signal, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const abortFromCaller = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", abortFromCaller, { once: true });
    }
  }

  try {
    return await fetcher(input, {
      ...rest,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}
