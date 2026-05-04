// Shared types for the model-usage telemetry layer.
//
// Anyone instrumenting an LLM call goes through:
//   1. callLlm(opts, telemetry)        — see ./router.ts
//   2. recordLlmEvent(event)           — see ./usage-recorder.ts
//
// This file is the contract between those two layers and the main-app
// aggregator that drains the Redis stream into daily blobs.

export type LlmProvider = 'kimi' | 'openrouter';

export type LlmFeature =
  | 'ai_analyst'
  | 'signal_brief'
  | 'agent_commerce'
  | 'aiso_scan'
  | 'idea_card'
  | 'digest';

export type LlmTaskType =
  | 'item'
  | 'ribbon'
  | 'summary'
  | 'ranking'
  | 'extraction'
  | 'report'
  | 'classification'
  | 'code_review';

export type LlmErrorCode =
  | 'timeout'
  | 'rate_limited'
  | 'auth'
  | 'provider_error'
  | 'client_error'
  | 'unknown';

export interface LlmTelemetry {
  feature: LlmFeature;
  task_type: LlmTaskType;
  /** Stable id per logical request (one per attempt). Caller-generated. */
  request_id: string;
  /** Optional — null for system-driven jobs (e.g. consensus-analyst). */
  user_id?: string | null;
  workspace_id?: string | null;
}

export interface LlmEvent {
  request_id: string;
  openrouter_generation_id: string | null;
  /** sha256(salt + user_id) [0..16], or null when unknown / system-driven. */
  user_id_hash: string | null;
  workspace_id: string | null;
  feature: LlmFeature;
  task_type: LlmTaskType;
  /**
   * Canonical model identifier. For OpenRouter: provider-prefixed slug
   * (e.g. 'anthropic/claude-3.5-sonnet'). For Kimi-direct: 'kimi-for-coding'
   * or whatever KIMI_MODEL resolves to.
   */
  model: string;
  provider: LlmProvider;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cached_input_tokens: number;
  /**
   * Authoritative cost in USD when known (OpenRouter generation metadata or
   * pre-computed at provider). null when waiting on async reconcile or when
   * estimable later from `llm-model-metadata` pricing.
   */
  cost_usd: number | null;
  /** True when cost was derived from model-metadata pricing rather than the provider's own usage record. */
  cost_estimated: boolean;
  latency_ms: number;
  /** Time to first content token. Null when not measured (e.g. non-stream paths). */
  ttft_ms: number | null;
  status: 'ok' | 'error';
  error_code: LlmErrorCode | null;
  /** ISO 8601. */
  created_at: string;
}

export interface LlmGenMeta {
  generation_id: string;
  cost_usd: number | null;
  native_tokens_input: number | null;
  native_tokens_output: number | null;
  fetched_at: string;
}

export interface ModelMeta {
  model_id: string;
  name: string;
  provider: string;
  context_length: number;
  input_price_per_million: number;
  output_price_per_million: number;
  supports_tools: boolean;
  supports_vision: boolean;
  supports_reasoning: boolean;
  last_synced_at: string;
}

// Stream + key namespace constants — single source of truth for both the
// worker-side writer and the main-app aggregator. If you bump these, bump
// both ends in lockstep.
export const LLM_EVENTS_STREAM = 'ss:llm:events:v1';
export const LLM_GEN_META_STREAM = 'ss:llm:gen-meta:v1';
export const LLM_AGG_CURSOR_KEY = 'ss:llm:agg:cursor';
/** ~ 100k events ≈ a few weeks at consensus-analyst's hourly cadence. Trim by id-time in the aggregator. */
export const LLM_EVENTS_MAXLEN = 100_000;
