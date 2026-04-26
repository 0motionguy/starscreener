// Tests for src/lib/source-health-tracker.ts.
//
// Covers:
//   - state transitions CLOSED → OPEN → HALF_OPEN → CLOSED/OPEN
//   - rolling window honours configured size
//   - success/failure counters update correctly inside the window
//   - openedAt + nextProbeAt populated when the breaker trips
//   - reset clears state for tests
//   - error message formatting truncates oversize payloads
//
// Run with: npx tsx --test src/lib/__tests__/source-health-tracker.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";

import { SourceHealthTracker } from "../source-health-tracker";

// Helper that constructs a tracker with a controllable clock.
function makeTracker(
  options: Partial<{
    windowSize: number;
    failureThreshold: number;
    cooldownMs: number;
  }> = {},
): {
  tracker: SourceHealthTracker;
  setNow: (ms: number) => void;
} {
  let now = Date.parse("2026-04-26T12:00:00.000Z");
  const tracker = new SourceHealthTracker(
    {
      windowSize: options.windowSize ?? 5,
      failureThreshold: options.failureThreshold ?? 3,
      cooldownMs: options.cooldownMs ?? 10_000,
    },
    () => now,
  );
  return {
    tracker,
    setNow: (ms: number) => {
      now = ms;
    },
  };
}

// ---------------------------------------------------------------------------
// CLOSED → OPEN transition
// ---------------------------------------------------------------------------

test("starts in CLOSED state with empty counters", () => {
  const { tracker } = makeTracker();
  const h = tracker.getHealth("hackernews");
  assert.equal(h.state, "CLOSED");
  assert.equal(h.successCount, 0);
  assert.equal(h.failureCount, 0);
  assert.equal(h.errorRate, 0);
  assert.equal(h.openedAt, null);
  assert.equal(h.nextProbeAt, null);
});

test("CLOSED → OPEN after N consecutive failures", () => {
  const { tracker } = makeTracker({ failureThreshold: 3 });
  tracker.recordFailure("hackernews", new Error("503"));
  tracker.recordFailure("hackernews", new Error("503"));
  assert.equal(tracker.getHealth("hackernews").state, "CLOSED");
  tracker.recordFailure("hackernews", new Error("503"));
  const h = tracker.getHealth("hackernews");
  assert.equal(h.state, "OPEN");
  assert.equal(h.consecutiveFailures, 3);
  assert.ok(h.openedAt !== null, "openedAt should be set");
  assert.ok(h.nextProbeAt !== null, "nextProbeAt should be set");
  assert.equal(tracker.isOpen("hackernews"), true);
});

test("a single success resets the consecutive-failure counter", () => {
  const { tracker } = makeTracker({ failureThreshold: 3 });
  tracker.recordFailure("reddit", "boom");
  tracker.recordFailure("reddit", "boom");
  tracker.recordSuccess("reddit");
  tracker.recordFailure("reddit", "boom");
  tracker.recordFailure("reddit", "boom");
  // Two-then-success-then-two should NOT trip a 3-threshold breaker.
  assert.equal(tracker.getHealth("reddit").state, "CLOSED");
});

// ---------------------------------------------------------------------------
// OPEN → HALF_OPEN → CLOSED / OPEN
// ---------------------------------------------------------------------------

test("OPEN → HALF_OPEN after cooldown elapses", () => {
  const { tracker, setNow } = makeTracker({
    failureThreshold: 2,
    cooldownMs: 5_000,
  });
  const t0 = Date.parse("2026-04-26T12:00:00.000Z");
  setNow(t0);
  tracker.recordFailure("bluesky", "boom");
  tracker.recordFailure("bluesky", "boom");
  assert.equal(tracker.isOpen("bluesky"), true);

  // Inside cooldown — still OPEN.
  setNow(t0 + 4_000);
  assert.equal(tracker.isOpen("bluesky"), true);
  assert.equal(tracker.getHealth("bluesky").state, "OPEN");

  // Cooldown elapsed — isOpen() flips to false and state moves to HALF_OPEN.
  setNow(t0 + 6_000);
  assert.equal(tracker.isOpen("bluesky"), false);
  assert.equal(tracker.getHealth("bluesky").state, "HALF_OPEN");
});

test("HALF_OPEN + success → CLOSED", () => {
  const { tracker, setNow } = makeTracker({
    failureThreshold: 2,
    cooldownMs: 5_000,
  });
  const t0 = Date.parse("2026-04-26T12:00:00.000Z");
  setNow(t0);
  tracker.recordFailure("devto", "boom");
  tracker.recordFailure("devto", "boom");
  setNow(t0 + 6_000);
  // Trigger the OPEN → HALF_OPEN transition.
  tracker.isOpen("devto");
  assert.equal(tracker.getHealth("devto").state, "HALF_OPEN");

  // Probe succeeded.
  tracker.recordSuccess("devto");
  const h = tracker.getHealth("devto");
  assert.equal(h.state, "CLOSED");
  assert.equal(h.openedAt, null);
  assert.equal(h.nextProbeAt, null);
  assert.equal(h.consecutiveFailures, 0);
});

test("HALF_OPEN + failure → back to OPEN with refreshed cooldown", () => {
  const { tracker, setNow } = makeTracker({
    failureThreshold: 2,
    cooldownMs: 5_000,
  });
  const t0 = Date.parse("2026-04-26T12:00:00.000Z");
  setNow(t0);
  tracker.recordFailure("nitter", "boom");
  tracker.recordFailure("nitter", "boom");
  const firstOpenedAt = tracker.getHealth("nitter").openedAt;
  assert.ok(firstOpenedAt);

  setNow(t0 + 6_000);
  tracker.isOpen("nitter"); // OPEN → HALF_OPEN
  assert.equal(tracker.getHealth("nitter").state, "HALF_OPEN");

  // Probe failed — back to OPEN with a fresh openedAt.
  tracker.recordFailure("nitter", "still boom");
  const h = tracker.getHealth("nitter");
  assert.equal(h.state, "OPEN");
  assert.notEqual(h.openedAt, firstOpenedAt, "openedAt should refresh");
  assert.equal(tracker.isOpen("nitter"), true);
});

// ---------------------------------------------------------------------------
// Rolling window
// ---------------------------------------------------------------------------

test("rolling window honours configured size", () => {
  const { tracker } = makeTracker({ windowSize: 5, failureThreshold: 99 });
  // Push 7 attempts — only the last 5 should appear in the window counts.
  tracker.recordFailure("github", "x");
  tracker.recordFailure("github", "x");
  tracker.recordSuccess("github");
  tracker.recordSuccess("github");
  tracker.recordSuccess("github");
  tracker.recordSuccess("github");
  tracker.recordSuccess("github");
  const h = tracker.getHealth("github");
  // Window holds the most recent 5: SSSSS.
  assert.equal(h.successCount + h.failureCount, 5);
  assert.equal(h.successCount, 5);
  assert.equal(h.failureCount, 0);
  // Total attempts is unbounded.
  assert.equal(h.totalAttempts, 7);
});

test("errorRate is failureCount / window length", () => {
  const { tracker } = makeTracker({ windowSize: 4, failureThreshold: 99 });
  tracker.recordSuccess("reddit");
  tracker.recordFailure("reddit", "x");
  tracker.recordFailure("reddit", "x");
  tracker.recordFailure("reddit", "x");
  const h = tracker.getHealth("reddit");
  // 3 failures / 4 attempts = 0.75
  assert.equal(h.errorRate, 0.75);
  assert.equal(h.failureCount, 3);
  assert.equal(h.successCount, 1);
});

// ---------------------------------------------------------------------------
// isOpen() short-circuit signal
// ---------------------------------------------------------------------------

test("isOpen() returns true while OPEN, false once HALF_OPEN", () => {
  const { tracker, setNow } = makeTracker({
    failureThreshold: 1,
    cooldownMs: 1_000,
  });
  const t0 = Date.parse("2026-04-26T12:00:00.000Z");
  setNow(t0);
  tracker.recordFailure("devto", "x");
  assert.equal(tracker.isOpen("devto"), true);

  // After cooldown: isOpen returns false (callers may probe), state = HALF_OPEN.
  setNow(t0 + 2_000);
  assert.equal(tracker.isOpen("devto"), false);
  assert.equal(tracker.getHealth("devto").state, "HALF_OPEN");
});

// ---------------------------------------------------------------------------
// getAllHealth + register
// ---------------------------------------------------------------------------

test("getAllHealth returns every registered source", () => {
  const { tracker } = makeTracker();
  tracker.register("hackernews");
  tracker.register("reddit");
  tracker.recordFailure("bluesky", "boom");
  const all = tracker.getAllHealth();
  assert.ok(all.hackernews);
  assert.ok(all.reddit);
  assert.ok(all.bluesky);
  assert.equal(all.hackernews.state, "CLOSED");
  assert.equal(all.bluesky.failureCount, 1);
});

test("reset() clears one source or all sources", () => {
  const { tracker } = makeTracker({ failureThreshold: 2 });
  tracker.recordFailure("hackernews", "x");
  tracker.recordFailure("hackernews", "x");
  tracker.recordFailure("reddit", "x");
  assert.equal(tracker.getHealth("hackernews").state, "OPEN");
  tracker.reset("hackernews");
  assert.equal(tracker.getHealth("hackernews").state, "CLOSED");
  assert.equal(tracker.getHealth("reddit").failureCount, 1);
  tracker.reset();
  assert.equal(tracker.getHealth("reddit").failureCount, 0);
});

// ---------------------------------------------------------------------------
// Error message formatting
// ---------------------------------------------------------------------------

test("recordFailure stores Error.message verbatim", () => {
  const { tracker } = makeTracker();
  tracker.recordFailure("bluesky", new Error("rate limited"));
  assert.equal(tracker.getHealth("bluesky").lastFailure, "rate limited");
});

test("recordFailure stores raw strings as-is", () => {
  const { tracker } = makeTracker();
  tracker.recordFailure("bluesky", "HTTP 503");
  assert.equal(tracker.getHealth("bluesky").lastFailure, "HTTP 503");
});

test("recordFailure truncates oversize messages", () => {
  const { tracker } = makeTracker();
  const huge = "x".repeat(500);
  tracker.recordFailure("bluesky", huge);
  const stored = tracker.getHealth("bluesky").lastFailure;
  assert.ok(stored && stored.length < 300);
  assert.ok(stored && stored.endsWith("…"));
});

test("recordFailure with undefined keeps lastFailure null", () => {
  const { tracker } = makeTracker();
  tracker.recordFailure("bluesky");
  assert.equal(tracker.getHealth("bluesky").lastFailure, null);
});

// ---------------------------------------------------------------------------
// Open circuit returns empty fallback (caller wiring contract)
// ---------------------------------------------------------------------------
//
// The tracker itself doesn't know about "fallback values" — that lives in
// the adapter wrappers. The contract is: when isOpen() returns true the
// caller MUST short-circuit and return its empty fallback. This test
// emulates that contract end-to-end so a regression in either layer is
// caught.

test("simulated adapter wraps tracker.isOpen and returns empty fallback when OPEN", async () => {
  const { tracker } = makeTracker({ failureThreshold: 2, cooldownMs: 30_000 });

  let upstreamCalled = 0;
  const fakeAdapter = async (
    fail: boolean,
  ): Promise<readonly string[]> => {
    if (tracker.isOpen("hackernews")) {
      // Empty fallback — do not invoke upstream.
      return [];
    }
    upstreamCalled += 1;
    if (fail) {
      tracker.recordFailure("hackernews", new Error("503"));
      return [];
    }
    tracker.recordSuccess("hackernews");
    return ["mention-1"];
  };

  // Two failures trip the breaker.
  await fakeAdapter(true);
  await fakeAdapter(true);
  assert.equal(upstreamCalled, 2);
  assert.equal(tracker.getHealth("hackernews").state, "OPEN");

  // Subsequent calls short-circuit — upstream is NOT touched.
  const out1 = await fakeAdapter(true);
  const out2 = await fakeAdapter(false);
  assert.deepEqual(out1, []);
  assert.deepEqual(out2, []);
  assert.equal(
    upstreamCalled,
    2,
    "upstream must not be called while breaker is OPEN",
  );
});

// ---------------------------------------------------------------------------
// HALF_OPEN probe path
// ---------------------------------------------------------------------------

test("HALF_OPEN probe success reopens upstream traffic", async () => {
  const { tracker, setNow } = makeTracker({
    failureThreshold: 2,
    cooldownMs: 5_000,
  });
  const t0 = Date.parse("2026-04-26T12:00:00.000Z");
  setNow(t0);
  tracker.recordFailure("github", "x");
  tracker.recordFailure("github", "x");
  assert.equal(tracker.isOpen("github"), true);

  // Cooldown elapses.
  setNow(t0 + 6_000);

  // Single probe — succeeds.
  if (!tracker.isOpen("github")) {
    tracker.recordSuccess("github");
  }
  assert.equal(tracker.getHealth("github").state, "CLOSED");
  // Upstream is now usable again.
  assert.equal(tracker.isOpen("github"), false);
});

test("HALF_OPEN probe failure schedules a fresh cooldown", () => {
  const { tracker, setNow } = makeTracker({
    failureThreshold: 2,
    cooldownMs: 5_000,
  });
  const t0 = Date.parse("2026-04-26T12:00:00.000Z");
  setNow(t0);
  tracker.recordFailure("github", "x");
  tracker.recordFailure("github", "x");

  setNow(t0 + 6_000);
  tracker.isOpen("github"); // OPEN → HALF_OPEN
  tracker.recordFailure("github", "still bad");
  const h = tracker.getHealth("github");
  assert.equal(h.state, "OPEN");
  // nextProbeAt should be at-or-after t0 + 6_000 + 5_000 = t0 + 11_000.
  assert.ok(h.nextProbeAt);
  assert.ok(Date.parse(h.nextProbeAt!) >= t0 + 11_000);
});
