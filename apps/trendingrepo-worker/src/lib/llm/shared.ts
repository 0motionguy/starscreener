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
