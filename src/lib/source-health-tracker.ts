// StarScreener — Per-source circuit breaker + rolling failure window.
//
// Companion to source-health.ts. The freshness reporter answers "when did
// the data last refresh?"; this tracker answers "is the upstream actually
// responding right now?" Each source maintains a rolling window of the last
// N attempts, a consecutive-failure counter, and a CLOSED → OPEN → HALF_OPEN
// state machine. When OPEN, callers get a graceful "skip the network call"
// signal so adapters can return an empty fallback instead of cascading
// failures into the UI.
//
// Pure in-memory. Process-local. No persistence — Vercel serverless cold
// starts reset state, which is the right behavior (a fresh process gets a
// fresh chance). Long-lived servers (Railway, Fly, Render) keep state across
// requests.
//
// Contract: NEVER throws from any tracker method. Recording a failure on an
// unknown source auto-registers it. Logs use the `[breaker:<source>] …`
// prefix so they're easy to filter from adapter logs.

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface SourceHealthSnapshot {
  source: string;
  state: CircuitState;
  /** Successes inside the rolling window. */
  successCount: number;
  /** Failures inside the rolling window. */
  failureCount: number;
  /** failureCount / windowSize — 0 if window empty. */
  errorRate: number;
  /** Total attempts since last reset (not capped to window). */
  totalAttempts: number;
  /** Window size used to compute counters. */
  windowSize: number;
  /** Consecutive failures at the tail of the window. */
  consecutiveFailures: number;
  /** ISO8601 timestamp of the most recent success, or null. */
  lastSuccessAt: string | null;
  /** ISO8601 timestamp of the most recent failure, or null. */
  lastFailureAt: string | null;
  /** Truncated error message from the most recent failure, or null. */
  lastFailure: string | null;
  /** ISO8601 timestamp the breaker last transitioned to OPEN, or null. */
  openedAt: string | null;
  /**
   * ISO8601 timestamp when the breaker will allow a probe (HALF_OPEN). Only
   * meaningful when state === "OPEN".
   */
  nextProbeAt: string | null;
}

export interface CircuitBreakerOptions {
  /** Rolling window length (most recent N attempts). */
  windowSize: number;
  /** Consecutive failures that flip CLOSED → OPEN. */
  failureThreshold: number;
  /** Milliseconds the breaker stays OPEN before allowing a HALF_OPEN probe. */
  cooldownMs: number;
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  windowSize: 50,
  failureThreshold: 5,
  cooldownMs: 60_000,
};

/** Truncate error messages so the snapshot stays small. */
const ERROR_MESSAGE_MAX = 240;

type Outcome = "success" | "failure";

interface SourceState {
  source: string;
  state: CircuitState;
  attempts: Outcome[]; // rolling window, oldest → newest
  totalAttempts: number;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailure: string | null;
  openedAt: string | null;
  nextProbeAt: string | null;
}

/**
 * Process-wide tracker. Constructed lazily on first import. Tests can build
 * isolated instances to avoid cross-test pollution; production code uses the
 * shared default exported from the bottom of the file.
 */
export class SourceHealthTracker {
  private readonly options: CircuitBreakerOptions;
  private readonly sources: Map<string, SourceState> = new Map();
  /** Injection seam for tests — defaults to Date.now(). */
  private readonly now: () => number;

  constructor(
    options: Partial<CircuitBreakerOptions> = {},
    nowFn: () => number = Date.now,
  ) {
    this.options = {
      windowSize: options.windowSize ?? DEFAULT_OPTIONS.windowSize,
      failureThreshold:
        options.failureThreshold ?? DEFAULT_OPTIONS.failureThreshold,
      cooldownMs: options.cooldownMs ?? DEFAULT_OPTIONS.cooldownMs,
    };
    this.now = nowFn;
  }

  /**
   * Record a successful call. Closes a HALF_OPEN circuit, resets the
   * consecutive-failure counter, advances the rolling window.
   */
  recordSuccess(source: string): void {
    const state = this.ensureSource(source);
    const nowIso = new Date(this.now()).toISOString();
    state.lastSuccessAt = nowIso;
    state.consecutiveFailures = 0;
    this.pushAttempt(state, "success");

    if (state.state === "OPEN" || state.state === "HALF_OPEN") {
      // Probe (or stale-OPEN auto-recovery) succeeded — close the circuit.
      console.log(
        `[breaker:${source}] state ${state.state} → CLOSED (success after recovery)`,
      );
      state.state = "CLOSED";
      state.openedAt = null;
      state.nextProbeAt = null;
    }
  }

  /**
   * Record a failed call. Trips the circuit when consecutive failures cross
   * the threshold; in HALF_OPEN any failure re-opens the breaker with a
   * fresh cooldown.
   */
  recordFailure(source: string, err?: unknown): void {
    const state = this.ensureSource(source);
    const nowMs = this.now();
    const nowIso = new Date(nowMs).toISOString();
    state.lastFailureAt = nowIso;
    state.lastFailure = formatError(err);
    state.consecutiveFailures += 1;
    this.pushAttempt(state, "failure");

    if (state.state === "HALF_OPEN") {
      // Probe failed — back to OPEN with a fresh cooldown.
      this.tripOpen(state, nowMs, "HALF_OPEN probe failed");
      return;
    }

    if (
      state.state === "CLOSED" &&
      state.consecutiveFailures >= this.options.failureThreshold
    ) {
      this.tripOpen(
        state,
        nowMs,
        `${state.consecutiveFailures} consecutive failures`,
      );
    }
  }

  /**
   * Returns true iff the circuit is currently OPEN. Side effect: when the
   * cooldown has elapsed, transitions OPEN → HALF_OPEN and returns false so
   * the caller can issue one probe attempt.
   *
   * This is the gate adapters consult before making the upstream request.
   */
  isOpen(source: string): boolean {
    const state = this.ensureSource(source);
    if (state.state === "CLOSED" || state.state === "HALF_OPEN") {
      return false;
    }
    // OPEN — see if cooldown has elapsed.
    if (state.nextProbeAt && Date.parse(state.nextProbeAt) <= this.now()) {
      console.log(
        `[breaker:${source}] state OPEN → HALF_OPEN (cooldown elapsed)`,
      );
      state.state = "HALF_OPEN";
      // Caller will invoke recordSuccess/recordFailure on the probe.
      return false;
    }
    return true;
  }

  /**
   * Snapshot of one source. Always returns an entry — registers the source
   * implicitly if it hasn't been seen before.
   */
  getHealth(source: string): SourceHealthSnapshot {
    const state = this.ensureSource(source);
    return this.buildSnapshot(state);
  }

  /**
   * Snapshot of every source the tracker has seen. Preregister sources via
   * `register()` to control which ones appear before any traffic.
   */
  getAllHealth(): Record<string, SourceHealthSnapshot> {
    const out: Record<string, SourceHealthSnapshot> = {};
    for (const state of this.sources.values()) {
      out[state.source] = this.buildSnapshot(state);
    }
    return out;
  }

  /**
   * Pre-register a source so it shows up in `/api/health/sources` even when
   * it hasn't received traffic yet. Idempotent.
   */
  register(source: string): void {
    this.ensureSource(source);
  }

  /**
   * Reset one source's state, or every source if no id is given. Intended
   * for tests; no production code path should rely on this.
   */
  reset(source?: string): void {
    if (source) {
      this.sources.delete(source);
      return;
    }
    this.sources.clear();
  }

  /** Read the configured options (read-only copy). */
  getOptions(): CircuitBreakerOptions {
    return { ...this.options };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private ensureSource(source: string): SourceState {
    const existing = this.sources.get(source);
    if (existing) return existing;
    const fresh: SourceState = {
      source,
      state: "CLOSED",
      attempts: [],
      totalAttempts: 0,
      consecutiveFailures: 0,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastFailure: null,
      openedAt: null,
      nextProbeAt: null,
    };
    this.sources.set(source, fresh);
    return fresh;
  }

  private pushAttempt(state: SourceState, outcome: Outcome): void {
    state.attempts.push(outcome);
    state.totalAttempts += 1;
    if (state.attempts.length > this.options.windowSize) {
      // Drop the oldest entry; rolling window holds the last N only.
      state.attempts.shift();
    }
  }

  private tripOpen(
    state: SourceState,
    nowMs: number,
    reason: string,
  ): void {
    const previous = state.state;
    state.state = "OPEN";
    state.openedAt = new Date(nowMs).toISOString();
    state.nextProbeAt = new Date(nowMs + this.options.cooldownMs).toISOString();
    console.warn(
      `[breaker:${state.source}] state ${previous} → OPEN (${reason}); next probe at ${state.nextProbeAt}`,
    );
  }

  private buildSnapshot(state: SourceState): SourceHealthSnapshot {
    let successes = 0;
    let failures = 0;
    for (const a of state.attempts) {
      if (a === "success") successes += 1;
      else failures += 1;
    }
    const window = state.attempts.length;
    return {
      source: state.source,
      state: state.state,
      successCount: successes,
      failureCount: failures,
      errorRate: window === 0 ? 0 : failures / window,
      totalAttempts: state.totalAttempts,
      windowSize: this.options.windowSize,
      consecutiveFailures: state.consecutiveFailures,
      lastSuccessAt: state.lastSuccessAt,
      lastFailureAt: state.lastFailureAt,
      lastFailure: state.lastFailure,
      openedAt: state.openedAt,
      nextProbeAt: state.nextProbeAt,
    };
  }
}

function formatError(err: unknown): string | null {
  if (err === undefined || err === null) return null;
  let raw: string;
  if (err instanceof Error) {
    raw = err.message || err.name || String(err);
  } else if (typeof err === "string") {
    raw = err;
  } else {
    try {
      raw = JSON.stringify(err);
    } catch {
      raw = String(err);
    }
  }
  if (raw.length > ERROR_MESSAGE_MAX) {
    return raw.slice(0, ERROR_MESSAGE_MAX) + "…";
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Process-wide singleton
// ---------------------------------------------------------------------------

/**
 * Canonical source ids tracked by the breaker. Registered up-front so the
 * `/api/health/sources` endpoint reports them even before any traffic flows.
 * Add new sources here when wiring a new adapter.
 */
export const KNOWN_SOURCES = [
  "hackernews",
  "reddit",
  "bluesky",
  "devto",
  "github",
  "github-search",
  "nitter",
  "lobsters",
  "producthunt",
] as const;

export type KnownSource = (typeof KNOWN_SOURCES)[number];

export const sourceHealthTracker = new SourceHealthTracker();

for (const id of KNOWN_SOURCES) {
  sourceHealthTracker.register(id);
}
