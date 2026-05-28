// Unit tests for the streaming-LLM idle-timeout guard. Uses fake timers — no
// network, no provider. Verifies the abort fires on idle, re-arms on chunk
// progress, can be cancelled, and that the error normalises to an AbortError
// so router.classifyError routes it to the retryable `timeout` fallback path.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createStreamIdleTimeout,
  toIdleTimeoutError,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
} from '../stream-timeout.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('createStreamIdleTimeout', () => {
  it('aborts after the idle window elapses with no reset', () => {
    vi.useFakeTimers();
    const idle = createStreamIdleTimeout(1000);
    expect(idle.signal.aborted).toBe(false);
    expect(idle.timedOut).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(idle.signal.aborted).toBe(true);
    expect(idle.timedOut).toBe(true);
    idle.clear();
  });

  it('reset() re-arms the timer so a progressing stream is not aborted', () => {
    vi.useFakeTimers();
    const idle = createStreamIdleTimeout(1000);
    vi.advanceTimersByTime(800);
    idle.reset(); // a chunk arrived
    vi.advanceTimersByTime(800); // 1600ms total, but only 800ms since reset
    expect(idle.signal.aborted).toBe(false);
    expect(idle.timedOut).toBe(false);
    idle.clear();
  });

  it('clear() cancels a pending abort', () => {
    vi.useFakeTimers();
    const idle = createStreamIdleTimeout(1000);
    idle.clear();
    vi.advanceTimersByTime(5000);
    expect(idle.signal.aborted).toBe(false);
    expect(idle.timedOut).toBe(false);
  });

  it('defaults to DEFAULT_STREAM_IDLE_TIMEOUT_MS when no arg is given', () => {
    vi.useFakeTimers();
    const idle = createStreamIdleTimeout();
    vi.advanceTimersByTime(DEFAULT_STREAM_IDLE_TIMEOUT_MS - 1);
    expect(idle.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(idle.signal.aborted).toBe(true);
    idle.clear();
  });
});

describe('toIdleTimeoutError', () => {
  it('normalises to an AbortError (router maps name==="AbortError" → retryable timeout)', () => {
    const err = toIdleTimeoutError('kimi', 1000, new Error('socket hang up'));
    expect(err.name).toBe('AbortError');
    expect(err.message).toContain('kimi');
    expect(err.message).toContain('1000');
  });

  it('preserves the underlying cause stack for debugging', () => {
    const cause = new Error('underlying');
    const err = toIdleTimeoutError('nanogpt', 500, cause);
    expect(err.stack).toBe(cause.stack);
  });
});
