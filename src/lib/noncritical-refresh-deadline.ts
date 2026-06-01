export const NON_CRITICAL_REFRESH_TIMEOUT_MS = 1200;

export type NonCriticalRefreshStatus = "settled" | "timeout";

/**
 * Give route chrome warmups a short budget. Refresh promises keep settling in
 * the background through Promise.allSettled, but rendering can continue with
 * the current memory/file snapshot when Redis or another store tier is slow.
 */
export async function waitForNonCriticalRefreshes(
  refreshes: Promise<unknown>[],
  _label: string,
  timeoutMs = NON_CRITICAL_REFRESH_TIMEOUT_MS,
): Promise<NonCriticalRefreshStatus> {
  if (refreshes.length === 0) return "settled";

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const settled = Promise.allSettled(refreshes).then(
    () => "settled" as const,
  );

  try {
    return await Promise.race([
      settled,
      new Promise<"timeout">((resolve) => {
        timeoutId = setTimeout(() => resolve("timeout"), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
