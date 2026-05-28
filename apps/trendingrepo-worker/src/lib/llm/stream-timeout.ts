// Idle-timeout guard for streaming LLM calls.
//
// The OpenAI SDK's per-request `timeout` covers establishing the response but
// does NOT re-arm between streamed chunks, so a connection that stalls
// mid-stream — or a reasoning model whose request never responds — pins the
// caller indefinitely. consensus-analyst runs a bounded queue of these calls;
// enough permanent hangs starve the whole sweep and freeze consensus-verdicts.
//
// This arms an AbortController that fires when no chunk arrives within
// `idleMs`. Callers pass `signal` to `client.chat.completions.create()`, call
// `reset()` on every received chunk, and `clear()` in a finally. When the
// timeout fires the SDK rejects; `toIdleTimeoutError` normalises that rejection
// to an `AbortError` so router.classifyError maps it to a retryable `timeout`
// and falls back to the secondary provider instead of failing the run.

export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 120_000;

export interface StreamIdleTimeout {
  readonly signal: AbortSignal;
  /** Re-arm the idle timer — call on every received chunk. */
  reset(): void;
  /** Cancel the idle timer — call in a finally once the stream is drained. */
  clear(): void;
  /** True once the idle timeout has fired (caller maps the SDK error). */
  readonly timedOut: boolean;
}

export function createStreamIdleTimeout(
  idleMs: number = DEFAULT_STREAM_IDLE_TIMEOUT_MS,
): StreamIdleTimeout {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const reset = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, idleMs);
  };
  const clear = (): void => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
  reset(); // arm immediately so a never-responding create() also aborts
  return {
    signal: controller.signal,
    reset,
    clear,
    get timedOut(): boolean {
      return timedOut;
    },
  };
}

/**
 * Normalise the SDK rejection that follows our abort into an `AbortError` so
 * `router.classifyError` maps it to `timeout` (retryable on the fallback
 * provider). `cause`'s stack is preserved for debugging.
 */
export function toIdleTimeoutError(
  provider: string,
  idleMs: number,
  cause: unknown,
): Error {
  const err = new Error(
    `${provider}: LLM stream idle for >${idleMs}ms — aborted to free the worker`,
  );
  err.name = 'AbortError';
  if (cause instanceof Error && cause.stack) err.stack = cause.stack;
  return err;
}
