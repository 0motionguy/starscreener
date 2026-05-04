// In-process queue + flush for LlmEvent records.
//
// recordLlmEvent() is fire-and-forget — it never blocks the LLM caller on a
// Redis write. Events are buffered in memory and flushed on a 1s timer (or
// on process shutdown / explicit flush). XADD to the LLM_EVENTS_STREAM with
// a MAXLEN ~ N approximate trim.
//
// Privacy guard: at compile time the public type cannot include any of the
// banned keys (prompt/response/text/messages/content/system_prompt/user_message).
// At runtime we re-check on every record() call — defence-in-depth in case a
// caller `as any`-casts past the type system.

import { createHash } from 'crypto';
import type { LlmEvent, LlmGenMeta } from './types.js';
import { LLM_EVENTS_MAXLEN, LLM_EVENTS_STREAM, LLM_GEN_META_STREAM } from './types.js';
import { getRedis } from '../redis.js';
import { loadEnv } from '../env.js';

// Keys the recorder rejects on every call. If a caller manages to slip
// through the compile-time guard (e.g. via `as` casts or untyped object spread)
// the runtime guard drops the event and warns — better to lose telemetry than
// leak prompt content.
const BANNED_KEYS = new Set([
  'prompt',
  'response',
  'text',
  'messages',
  'content',
  'system_prompt',
  'user_message',
  'systemPrompt',
  'userMessage',
  'system',
  'user',
]);

/**
 * Hash a user_id for pseudonymous analytics. Returns null when no salt is
 * configured (the consumer side should treat null as "unknown user"). We
 * keep 16 hex chars (64 bits) — enough to disambiguate within our app's
 * traffic scale, short enough that nothing about the original id is
 * recoverable even via length-leak.
 */
export function hashUserId(userId: string | null | undefined): string | null {
  if (!userId) return null;
  const env = loadEnv();
  const salt = env.LLM_USER_HASH_SALT;
  if (!salt) return null;
  return createHash('sha256').update(salt + userId).digest('hex').slice(0, 16);
}

interface QueueState {
  events: LlmEvent[];
  genMeta: LlmGenMeta[];
  flushTimer: NodeJS.Timeout | null;
  flushing: Promise<void> | null;
  shutdownHooked: boolean;
}

const FLUSH_INTERVAL_MS = 1_000;

const state: QueueState = {
  events: [],
  genMeta: [],
  flushTimer: null,
  flushing: null,
  shutdownHooked: false,
};

function ensureShutdownHook(): void {
  if (state.shutdownHooked) return;
  state.shutdownHooked = true;
  // Best-effort flush on graceful shutdown. The runtime worker process
  // exits on SIGTERM (Railway), so we hook there too.
  const onExit = (): void => {
    void flushLlmEvents().catch((err: unknown) => {
      console.warn('[llm-recorder] flush on exit failed:', err);
    });
  };
  process.on('beforeExit', onExit);
  process.on('SIGINT', onExit);
  process.on('SIGTERM', onExit);
}

function scheduleFlush(): void {
  if (state.flushTimer) return;
  state.flushTimer = setTimeout(() => {
    state.flushTimer = null;
    void flushLlmEvents().catch((err: unknown) => {
      console.warn('[llm-recorder] scheduled flush failed:', err);
    });
  }, FLUSH_INTERVAL_MS);
  if (typeof state.flushTimer.unref === 'function') {
    // Don't keep the event loop alive solely for the flush timer.
    state.flushTimer.unref();
  }
}

function runtimePrivacyCheck(event: Record<string, unknown>): boolean {
  for (const key of Object.keys(event)) {
    if (BANNED_KEYS.has(key)) {
      const message = `[llm-recorder] BLOCKED event with banned key "${key}" — refusing to record.`;
      if (process.env.NODE_ENV === 'development') {
        throw new Error(message);
      }
      console.warn(message);
      return false;
    }
  }
  return true;
}

/**
 * Enqueue a single LlmEvent. Returns immediately. The actual XADD happens
 * within FLUSH_INTERVAL_MS or on process exit.
 */
export function recordLlmEvent(event: LlmEvent): void {
  if (!runtimePrivacyCheck(event as unknown as Record<string, unknown>)) return;
  state.events.push(event);
  ensureShutdownHook();
  scheduleFlush();
}

/**
 * Enqueue a generation-metadata reconcile record. Cron aggregator joins this
 * stream with the events stream by `generation_id` to upgrade `cost_usd` from
 * estimated to authoritative.
 */
export function recordLlmGenMeta(meta: LlmGenMeta): void {
  state.genMeta.push(meta);
  ensureShutdownHook();
  scheduleFlush();
}

/**
 * Flush any queued events + gen-meta records to Redis Streams. Safe to call
 * concurrently — overlapping callers share the same in-flight promise.
 */
export async function flushLlmEvents(): Promise<void> {
  if (state.flushing) return state.flushing;
  if (state.events.length === 0 && state.genMeta.length === 0) return;

  // Take ownership of the buffer so new events landing during the flush
  // don't get lost or double-written.
  const eventsBatch = state.events;
  const genMetaBatch = state.genMeta;
  state.events = [];
  state.genMeta = [];

  state.flushing = (async (): Promise<void> => {
    const handle = await getRedis();
    if (!handle) {
      // Redis not configured — drop. We could retain in-memory but the
      // intent of "no Redis = no telemetry" is fine for v1.
      return;
    }
    try {
      for (const event of eventsBatch) {
        await handle.xadd(
          LLM_EVENTS_STREAM,
          { e: JSON.stringify(event) },
          { maxlenApprox: LLM_EVENTS_MAXLEN },
        );
      }
      for (const meta of genMetaBatch) {
        await handle.xadd(
          LLM_GEN_META_STREAM,
          { e: JSON.stringify(meta) },
          { maxlenApprox: LLM_EVENTS_MAXLEN },
        );
      }
    } catch (err) {
      console.warn('[llm-recorder] XADD failed, dropping batch:', err);
    }
  })().finally(() => {
    state.flushing = null;
  });

  return state.flushing;
}

/** Test helper — drop queued state without flushing. */
export function _resetLlmRecorderForTests(): void {
  state.events.length = 0;
  state.genMeta.length = 0;
  if (state.flushTimer) {
    clearTimeout(state.flushTimer);
    state.flushTimer = null;
  }
  state.flushing = null;
}
