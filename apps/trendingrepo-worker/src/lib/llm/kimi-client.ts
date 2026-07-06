// Kimi (Moonshot AI) wrapper — OpenAI-compatible API.
//
// Two supported endpoint flavors:
//   1. Kimi For Coding subscription (default) — https://api.kimi.com/coding/v1
//      Model: kimi-for-coding (= Kimi K2.6, 262k ctx, reasoning).
//      ⚠ Access-gated by User-Agent allowlist (claude-cli, RooCode,
//      Kilo-Code, etc). We send User-Agent "claude-cli/1.0" so the
//      analyst fetcher is admitted.
//   2. Moonshot developer API — https://api.moonshot.ai/v1, model
//      kimi-k2-0711-preview or kimi-k2.6. Set KIMI_BASE_URL +
//      KIMI_MODEL to swap.
//
// Both expose OpenAI-compatible chat-completions, including JSON mode
// (response_format type: json_object) — strict JSON output, no fence
// parsing. Kimi auto-caches identical prefixes; the system prompt is
// reused across the top-14 sweep transparently.
//
// PROVENANCE: extracted verbatim from the original
// `apps/trendingrepo-worker/src/fetchers/consensus-analyst/llm.ts`
// (commit history shows the original file). Behavior is unchanged. The
// only addition is the unified `meta` field on the return value so the
// router can record telemetry uniformly across providers.

import OpenAI from 'openai';
import { FatalConfigError } from '../errors.js';
import { loadEnv } from '../env.js';
import {
  isTemperatureRestrictionError,
  type LlmCallOptions,
  type LlmCallResult,
} from './shared.js';
import {
  createStreamIdleTimeout,
  toIdleTimeoutError,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
} from './stream-timeout.js';

const DEFAULT_BASE_URL = 'https://api.kimi.com/coding/v1';
const DEFAULT_MODEL = 'kimi-for-coding';
const DEFAULT_USER_AGENT = 'claude-cli/1.0';

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (cachedClient) return cachedClient;
  const env = loadEnv();
  if (!env.KIMI_API_KEY) {
    throw new FatalConfigError('KIMI_API_KEY not set — analyst fetcher cannot run');
  }
  cachedClient = new OpenAI({
    apiKey: env.KIMI_API_KEY,
    baseURL: env.KIMI_BASE_URL ?? DEFAULT_BASE_URL,
    defaultHeaders: { 'User-Agent': DEFAULT_USER_AGENT },
  });
  return cachedClient;
}

export function isKimiConfigured(): boolean {
  return Boolean(loadEnv().KIMI_API_KEY);
}

export async function callKimi(opts: LlmCallOptions): Promise<LlmCallResult> {
  const env = loadEnv();
  const model = opts.model ?? env.KIMI_MODEL ?? DEFAULT_MODEL;
  const client = getClient();
  const startedAt = Date.now();
  let ttftMs: number | null = null;

  let text = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens = 0;

  // Idle-timeout guard: a stalled stream (or a create() that never responds)
  // would otherwise pin the consensus-analyst worker indefinitely. Aborts when
  // no chunk arrives within the idle budget; the router treats the resulting
  // AbortError as a retryable timeout and falls back to NanoGPT.
  const idle = createStreamIdleTimeout();
  try {
    // Kimi For Coding endpoint requires stream:true for the K2.6 reasoning
    // model — non-stream requests hang silently for any non-trivial payload.
    const makeParams = (includeTemperature: boolean) =>
      ({
        model,
        max_tokens: opts.maxTokens ?? 2048,
        ...(includeTemperature ? { temperature: opts.temperature ?? 0.4 } : {}),
        stream: true as const,
        stream_options: { include_usage: true },
        messages: [
          { role: 'system' as const, content: opts.systemPrompt },
          { role: 'user' as const, content: opts.userMessage },
        ],
        ...(opts.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
      });
    const createStream = (includeTemperature: boolean) =>
      client.chat.completions.create(makeParams(includeTemperature), { signal: idle.signal });

    let stream: Awaited<ReturnType<typeof createStream>>;
    try {
      stream = await createStream(true);
    } catch (err) {
      // Proxied models that forbid sampling overrides hard-reject with
      // `400 invalid temperature: only 1 is allowed` — retry once WITHOUT
      // temperature so the server default applies (see shared.ts helper).
      if (!isTemperatureRestrictionError(err)) throw err;
      console.warn(
        `[kimi] model ${model} rejects custom temperature — retrying with provider default`,
      );
      idle.reset();
      stream = await createStream(false);
    }

    for await (const chunk of stream) {
      idle.reset();
      const delta = chunk.choices?.[0]?.delta as
        | { content?: string; reasoning_content?: string }
        | undefined;
      if (delta?.content) {
        if (ttftMs === null) ttftMs = Date.now() - startedAt;
        text += delta.content;
      }
      const usage = chunk.usage as
        | {
            prompt_tokens?: number;
            completion_tokens?: number;
            prompt_tokens_details?: { cached_tokens?: number };
          }
        | undefined;
      if (usage) {
        inputTokens = usage.prompt_tokens ?? inputTokens;
        outputTokens = usage.completion_tokens ?? outputTokens;
        cachedInputTokens = usage.prompt_tokens_details?.cached_tokens ?? cachedInputTokens;
      }
    }
  } catch (err) {
    throw idle.timedOut
      ? toIdleTimeoutError('kimi', DEFAULT_STREAM_IDLE_TIMEOUT_MS, err)
      : err;
  } finally {
    idle.clear();
  }

  return {
    text,
    usage: { inputTokens, outputTokens, cachedInputTokens },
    meta: {
      provider: 'kimi',
      model,
      generationId: null,
      latencyMs: Date.now() - startedAt,
      ttftMs,
    },
  };
}

/**
 * Best-effort JSON parse. With jsonMode the response should already be a
 * valid JSON object, but defend against the rare malformed reply by trying
 * to extract the largest brace-balanced substring.
 */
export function parseJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace <= firstBrace) return null;
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
}
