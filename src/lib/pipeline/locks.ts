// StarScreener Pipeline — in-process locks.
//
// Phase 2 P-112 (F-RACE-001): the recompute pass is a read-modify-write
// across every store (repos, scores, categories, reasons, alert state),
// and concurrent invocations — two overlapping cron fires, a cron + a
// manual /api/pipeline/recompute, etc. — produced lost-update races and
// duplicate alert emissions.
//
// `withRecomputeLock(fn)` serializes recompute work process-wide:
//
//   - First caller runs fn() and assigns the resulting promise to
//     `inFlight`.
//   - Subsequent callers await the same inFlight promise (so they see
//     the same summary, rather than kicking off their own pass).
//   - Once settled, inFlight is cleared so the next caller starts
//     fresh.
//
// Caveats this does NOT solve:
//
//   - Multi-process: a single Node.js process. Distributed recompute
//     protection requires a shared store (Redis SETNX, Postgres
//     advisory lock). Tracked as part of H2-5 (Postgres migration).
//   - Restart bypass: this lock is reset at process boot. The separate
//     /api/pipeline/recompute cooldown (per-process, 15s) also resets;
//     a future patch should persist `lastFinishedAt` to disk.

type RecomputeFn<T> = () => Promise<T>;

let inFlight: Promise<unknown> | null = null;

export async function withRecomputeLock<T>(fn: RecomputeFn<T>): Promise<T> {
  if (inFlight) {
    // Coalesce: every concurrent caller awaits the same run and gets the
    // same return value. This matches the semantics of "recompute is
    // idempotent-over-time, so the second caller's intent is satisfied
    // by waiting on the first pass."
    return (await inFlight) as T;
  }
  const run = fn();
  inFlight = run;
  try {
    return await run;
  } finally {
    if (inFlight === run) inFlight = null;
  }
}

/** Test-only: reset the lock so each test starts from a clean state. */
export function __resetRecomputeLockForTests(): void {
  inFlight = null;
}
