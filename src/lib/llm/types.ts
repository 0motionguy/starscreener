// Main-app side mirror of apps/trendingrepo-worker/src/lib/llm/types.ts.
//
// Both files are append-friendly contracts; if you add a field, add it on
// both sides and bump the namespace if shapes changed incompatibly. The
// aggregator + dashboard read what the worker writes, so they MUST agree.

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

export interface LlmEvent {
  request_id: string;
  openrouter_generation_id: string | null;
  user_id_hash: string | null;
  workspace_id: string | null;
  feature: LlmFeature;
  task_type: LlmTaskType;
  model: string;
  provider: LlmProvider;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cached_input_tokens: number;
  cost_usd: number | null;
  cost_estimated: boolean;
  latency_ms: number;
  ttft_ms: number | null;
  status: 'ok' | 'error';
  error_code: LlmErrorCode | null;
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

export interface ModelMetadataPayload {
  syncedAt: string;
  models: ModelMeta[];
}

// Daily aggregate row shapes — written by /api/cron/llm/aggregate, read by
// /api/model-usage/* and the /model-usage page.

export interface DailyMetricBase {
  events: number;
  errors: number;
  success_rate: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
  cost_estimated_share: number;
  latency_p50_ms: number;
  latency_p95_ms: number;
}

export interface DailyByModelRow extends DailyMetricBase {
  day: string; // YYYY-MM-DD
  model: string;
  provider: LlmProvider;
}

export interface DailyByFeatureRow extends DailyMetricBase {
  day: string;
  feature: LlmFeature;
}

export interface DailySummaryRow extends DailyMetricBase {
  day: string;
  models_active: number;
}

export interface DailyByModelPayload {
  rows: DailyByModelRow[];
}
export interface DailyByFeaturePayload {
  rows: DailyByFeatureRow[];
}
export interface DailySummaryPayload {
  rows: DailySummaryRow[];
}

// Stream + key constants.
export const LLM_EVENTS_STREAM = 'ss:llm:events:v1';
export const LLM_GEN_META_STREAM = 'ss:llm:gen-meta:v1';
export const LLM_AGG_CURSOR_KEY = 'ss:llm:agg:cursor';
export const LLM_AGG_HEARTBEAT_KEY = 'llm-aggregate-heartbeat';
export const LLM_EVENTS_MAXLEN = 100_000;

// Public anonymization threshold — below this many events in 24h, a model's
// individual rank/share fields roll up into the 'other' bucket on the
// public surface. Internal admin views bypass this gate.
export const PUBLIC_MIN_EVENTS = 20;

// Day window for the trim policy. Aggregator XTRIMs events older than 30d
// after each run so the stream stays bounded regardless of MAXLEN.
export const RAW_EVENTS_RETENTION_DAYS = 30;
export const DAILY_RETENTION_DAYS = 90;
