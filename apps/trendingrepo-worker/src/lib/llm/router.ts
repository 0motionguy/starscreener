// Provider router + telemetry surface.
//
// One choke point for every LLM call in the worker. Reads LLM_PROVIDER from
// env, dispatches to the matching client, records a uniform LlmEvent per
// attempt, and — when LLM_FALLBACK_PROVIDER is set — transparently retries a
// failed call on the secondary provider before giving up.
//
// Adopters call:
//   const r = await callLlm({ systemPrompt, userMessage, ... }, {
//     feature: 'ai_analyst',
//     task_type: 'item',
//     request_id: crypto.randomUUID(),
//   });
//
// Telemetry is required at the call site so blank events can never reach the
// stream — the type makes that a compile error. Each provider attempt (primary
// and, if it fails, fallback) emits its own event, so usage/cost stay accurate.

import { loadEnv } from '../env.js';
import type { LlmCallOptions, LlmCallResult } from './shared.js';
import { callKimi, isKimiConfigured } from './kimi-client.js';
import { callOpenRouter, LlmCallError } from './openrouter-client.js';
import { callNanoGpt, isNanoGptConfigured } from './nanogpt-client.js';
import { hashUserId, recordLlmEvent } from './usage-recorder.js';
import type { LlmErrorCode, LlmEvent, LlmProvider, LlmTelemetry } from './types.js';

// OpenRouter requires an explicit model id; Kimi/NanoGPT fall back to their own
// defaults. These are only used when a caller passes no `model` (consensus-
// analyst doesn't) so the chosen provider still has something to route to.
const OPENROUTER_FALLBACK_MODEL = 'moonshotai/kimi-k2';
const NANOGPT_FALLBACK_MODEL = 'moonshotai/kimi-k2.6';

// Error classes worth retrying on a *different* provider. A quota/billing 403
// (Kimi-for-coding out of credit), a 429, a 5xx, or a timeout are all things a
// healthy second provider can serve. A 4xx client error / unknown would most
// likely fail identically downstream, so we don't burn a second call on it.
const RETRYABLE_FOR_FALLBACK: ReadonlySet<LlmErrorCode> = new Set([
  'auth',
  'rate_limited',
  'provider_error',
  'timeout',
]);

export function getLlmProvider(): LlmProvider {
  return loadEnv().LLM_PROVIDER ?? 'kimi';
}

export function getLlmFallbackProvider(): LlmProvider | null {
  return loadEnv().LLM_FALLBACK_PROVIDER ?? null;
}

function isProviderConfigured(provider: LlmProvider): boolean {
  switch (provider) {
    case 'kimi':
      return isKimiConfigured();
    case 'nanogpt':
      return isNanoGptConfigured();
    case 'openrouter':
      return Boolean(loadEnv().OPENROUTER_API_KEY);
    default:
      return false;
  }
}

/**
 * True when the primary provider OR the configured fallback has credentials.
 * Note: a *set-but-out-of-quota* key (Kimi 403) still counts as configured —
 * the 403 surfaces at call time and triggers the fallback, which is exactly
 * what we want while billing is restored.
 */
export function isLlmConfigured(): boolean {
  if (isProviderConfigured(getLlmProvider())) return true;
  const fallback = getLlmFallbackProvider();
  return fallback ? isProviderConfigured(fallback) : false;
}

/** Map any provider error to the shared LlmErrorCode taxonomy. */
function classifyError(err: unknown): LlmErrorCode {
  // OpenRouter client throws typed LlmCallError already.
  if (err instanceof LlmCallError) return err.code;
  if (err instanceof Error && err.name === 'AbortError') return 'timeout';
  // OpenAI SDK (Kimi + NanoGPT) throws APIError subclasses carrying `.status`.
  const status = (err as { status?: unknown } | null | undefined)?.status;
  if (typeof status === 'number') {
    if (status === 401 || status === 403) return 'auth';
    if (status === 429) return 'rate_limited';
    if (status >= 500) return 'provider_error';
    if (status >= 400) return 'client_error';
  }
  // Connection-level failures (no HTTP status) — treat as transient/provider.
  if (
    err instanceof Error &&
    /timed?\s*out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up/i.test(
      err.message,
    )
  ) {
    return 'provider_error';
  }
  return 'unknown';
}

function callProvider(provider: LlmProvider, opts: LlmCallOptions): Promise<LlmCallResult> {
  switch (provider) {
    case 'openrouter':
      return callOpenRouter(opts);
    case 'nanogpt':
      return callNanoGpt(opts);
    case 'kimi':
    default:
      return callKimi(opts);
  }
}

/** Inject a per-provider default model when the caller didn't pass one. */
function withProviderModel(provider: LlmProvider, opts: LlmCallOptions): LlmCallOptions {
  if (opts.model) return opts;
  const env = loadEnv();
  if (provider === 'nanogpt') {
    return { ...opts, model: env.NANOGPT_MODEL ?? NANOGPT_FALLBACK_MODEL };
  }
  if (provider === 'openrouter') {
    return { ...opts, model: env.OPENROUTER_MODEL ?? OPENROUTER_FALLBACK_MODEL };
  }
  return opts; // kimi resolves KIMI_MODEL / its own default internally
}

/**
 * Single provider attempt. Records exactly one LlmEvent (ok or error) and
 * rethrows on failure so the caller can decide whether to fall back.
 */
async function attempt(
  provider: LlmProvider,
  opts: LlmCallOptions,
  telemetry: LlmTelemetry,
): Promise<LlmCallResult> {
  const effectiveOpts = withProviderModel(provider, opts);
  const startedAt = Date.now();
  try {
    const result = await callProvider(provider, effectiveOpts);
    const event: LlmEvent = {
      request_id: telemetry.request_id,
      openrouter_generation_id: result.meta.generationId,
      user_id_hash: hashUserId(telemetry.user_id ?? null),
      workspace_id: telemetry.workspace_id ?? null,
      feature: telemetry.feature,
      task_type: telemetry.task_type,
      model: result.meta.model,
      provider: result.meta.provider,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      total_tokens: result.usage.inputTokens + result.usage.outputTokens,
      cached_input_tokens: result.usage.cachedInputTokens,
      // For OpenRouter we leave cost null and let the aggregator reconcile via
      // gen-meta; for Kimi/NanoGPT-direct cost is unknown until pricing is
      // wired into model-metadata, so the aggregator estimates.
      cost_usd: null,
      cost_estimated: false,
      latency_ms: result.meta.latencyMs,
      ttft_ms: result.meta.ttftMs,
      status: 'ok',
      error_code: null,
      created_at: new Date(startedAt).toISOString(),
    };
    recordLlmEvent(event);
    return result;
  } catch (err) {
    const errorCode = classifyError(err);
    const event: LlmEvent = {
      request_id: telemetry.request_id,
      openrouter_generation_id: null,
      user_id_hash: hashUserId(telemetry.user_id ?? null),
      workspace_id: telemetry.workspace_id ?? null,
      feature: telemetry.feature,
      task_type: telemetry.task_type,
      model: effectiveOpts.model ?? '',
      provider,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      cached_input_tokens: 0,
      cost_usd: 0,
      cost_estimated: false,
      latency_ms: Date.now() - startedAt,
      ttft_ms: null,
      status: 'error',
      error_code: errorCode,
      created_at: new Date(startedAt).toISOString(),
    };
    recordLlmEvent(event);
    throw err;
  }
}

export async function callLlm(
  opts: LlmCallOptions,
  telemetry: LlmTelemetry,
): Promise<LlmCallResult> {
  const primary = getLlmProvider();
  try {
    return await attempt(primary, opts, telemetry);
  } catch (err) {
    const fallback = getLlmFallbackProvider();
    if (
      fallback &&
      fallback !== primary &&
      RETRYABLE_FOR_FALLBACK.has(classifyError(err)) &&
      isProviderConfigured(fallback)
    ) {
      // `attempt(primary)` already recorded the failure event; the fallback
      // attempt records its own. No swallowing — if the fallback also fails,
      // its error propagates.
      return await attempt(fallback, opts, telemetry);
    }
    throw err;
  }
}
