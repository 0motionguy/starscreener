export const AGENT_COMMERCE_STORE_READ_TIMEOUT_MS = 1200;

/**
 * Bound best-effort data-store reads used during /agent-commerce route renders.
 * The underlying Redis request may continue, but the render path stops waiting
 * and falls back to the existing file/memory cache.
 */
export async function withRefreshTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = AGENT_COMMERCE_STORE_READ_TIMEOUT_MS,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`${label} data-store read timeout`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
