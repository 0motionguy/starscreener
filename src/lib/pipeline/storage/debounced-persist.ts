// Shared debounce-persist factory.
//
// LIB-13 from TECH_DEBT_AUDIT.md. The pipeline singleton and the twitter
// store each had their own copy of the same debounce-then-flush dance —
// same `setTimeout` + `clearTimeout` + `unref()` + isPersistenceEnabled
// gate + async flush handler. This factory consolidates them so the next
// store needing the same pattern doesn't fork a third copy.
//
// Each handle owns its own timer state, so the pipeline persist clock is
// independent of the twitter persist clock (the prior code kept them in
// separate module-level variables for the same reason).

import { isPersistenceEnabled } from "./file-persistence";

export interface DebouncedPersistOptions {
  /** What to actually run when the debounce fires. Should be safe to await. */
  flush: () => Promise<void>;
  /** Default debounce window. Callers can still override per `schedule()` call. */
  debounceMs?: number;
  /** Log scope prefix for the on-failure console.error. e.g. "pipeline" or "twitter". */
  label: string;
}

export interface DebouncedPersist {
  /** Reset the timer. No-op when persistence is disabled. */
  schedule(delayMs?: number): void;
  /** Drop any pending fire without flushing. */
  cancel(): void;
  /** Cancel + run the underlying `flush()` synchronously-awaitably. */
  flush(): Promise<void>;
}

const DEFAULT_DEBOUNCE_MS = 2_000;

export function createDebouncedPersist(
  opts: DebouncedPersistOptions,
): DebouncedPersist {
  const defaultDelay = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return {
    schedule(delayMs: number = defaultDelay): void {
      if (!isPersistenceEnabled()) return;
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        opts.flush().catch((err) => {
          // eslint-disable-next-line no-console
          console.error(`[${opts.label}] debounced persist failed`, err);
        });
      }, Math.max(0, delayMs));
      // Best-effort: don't keep the Node event loop alive purely for a
      // pending persist. When the timer has `.unref()` (Node timers) we
      // call it so ephemeral CLIs / tests can exit even with an
      // un-flushed timer queued.
      if (timer !== null && typeof (timer as { unref?: () => void }).unref === "function") {
        (timer as { unref: () => void }).unref();
      }
    },
    cancel(): void {
      clearTimer();
    },
    async flush(): Promise<void> {
      clearTimer();
      await opts.flush();
    },
  };
}
