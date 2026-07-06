// Shared call shape — the one interface every LLM-using fetcher targets.
//
// Kept stable: existing consensus-analyst code already destructures
// `{ text, usage: { inputTokens, outputTokens, cachedInputTokens } }`. The
// new `meta` field is additive so adopters opt in to telemetry without
// changing existing accumulator code.

import type { LlmProvider } from './types.js';

export interface LlmCallOptions {
  systemPrompt: string;
  userMessage: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Set true when expecting JSON object output. Adds response_format. */
  jsonMode?: boolean;
}

export interface LlmCallResult {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    /** Provider-reported cached prefix tokens. 0 when the provider doesn't expose it. */
    cachedInputTokens: number;
  };
  /** Telemetry surface — populated by router after either provider returns. */
  meta: LlmCallMeta;
}

export interface LlmCallMeta {
  provider: LlmProvider;
  /** Provider-resolved model id (e.g. 'kimi-for-coding' or 'anthropic/claude-3.5-sonnet'). */
  model: string;
  /**
   * OpenRouter generation id when available. Null on Kimi-direct (no
   * generation_id concept) or when the provider response didn't include one.
   */
  generationId: string | null;
  latencyMs: number;
  /** Time to first content delta. Null when not measured. */
  ttftMs: number | null;
}

/**
 * `400 invalid temperature: only 1 is allowed for this model` — thrown by
 * OpenAI-compatible proxies when the routed model (gpt-5/o-series style)
 * forbids sampling overrides. Every provider client retries ONCE without
 * `temperature` when this matches, so the server default (1) applies while
 * models that accept tuning keep the fetcher-specified value. Matched
 * loosely (status 400 + "temperature") so wording drift keeps matching.
 */
export function isTemperatureRestrictionError(err: unknown): boolean {
  const e = err as { status?: number; message?: string } | null;
  return e?.status === 400 && /temperature/i.test(e?.message ?? '');
}

/**
 * Models observed rejecting sampling overrides, memoized for the process
 * lifetime. The first call per model pays one doomed request + retry; every
 * subsequent call skips `temperature` outright. consensus-analyst fires
 * dozens of Kimi calls per run — without the memo each one wasted a full
 * round-trip, doubling run latency and blowing the one-shot budget.
 */
const temperatureRejectingModels = new Set<string>();

export function modelRejectsTemperature(model: string): boolean {
  return temperatureRejectingModels.has(model);
}

export function markTemperatureRejected(model: string): void {
  temperatureRejectingModels.add(model);
}
