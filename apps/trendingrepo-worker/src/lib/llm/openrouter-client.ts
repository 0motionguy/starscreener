// OpenRouter chat-completions streamer.
//
// Native fetch — no SDK. Streams via SSE, accumulates content + usage, and
// returns a unified LlmCallResult that mirrors the existing Kimi-direct
// shape so consensus-analyst can swap providers via env without touching
// any consumer code.

import { loadEnv } from '../env.js';
import type { LlmCallOptions, LlmCallResult, LlmCallMeta } from './shared.js';
import type { LlmErrorCode } from './types.js';
import { scheduleGenMetaReconcile } from './gen-meta-fetcher.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_TIMEOUT_MS = 90_000;

interface OpenRouterDelta {
  content?: string;
  reasoning?: string;
}

interface OpenRouterChunk {
  id?: string;
  model?: string;
  choices?: Array<{ delta?: OpenRouterDelta; finish_reason?: string | null }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}

export async function callOpenRouter(opts: LlmCallOptions): Promise<LlmCallResult> {
  const env = loadEnv();
  if (!env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not set — OpenRouter caller cannot run');
  }
  const model = opts.model;
  if (!model) {
    throw new Error('OpenRouter requires an explicit model id (e.g. "moonshotai/kimi-k2")');
  }

  const startedAt = Date.now();
  let ttftMs: number | null = null;
  let generationId = '';
  let resolvedModel = model;
  let text = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens = 0;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': env.OPENROUTER_REFERER ?? 'https://starscreener.app',
        'X-Title': 'STARSCREENER',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 2048,
        temperature: opts.temperature ?? 0.4,
        stream: true,
        stream_options: { include_usage: true },
        messages: [
          { role: 'system', content: opts.systemPrompt },
          { role: 'user', content: opts.userMessage },
        ],
        ...(opts.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
      }),
      signal: ac.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const isAbort = err instanceof Error && err.name === 'AbortError';
    throw makeError(isAbort ? 'timeout' : 'unknown', isAbort ? 'OpenRouter request timed out' : `OpenRouter fetch failed: ${stringify(err)}`);
  }

  if (!res.ok || !res.body) {
    clearTimeout(timer);
    const code = classifyHttp(res.status);
    let body = '';
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
    throw makeError(code, `OpenRouter ${res.status}: ${body.slice(0, 500)}`);
  }

  try {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Split on SSE event boundaries (\n\n). Last partial line stays buffered.
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';
      for (const evt of events) {
        const lines = evt.split('\n');
        for (const raw of lines) {
          const line = raw.trim();
          if (!line || !line.startsWith('data:')) continue;
          const payload = line.slice('data:'.length).trim();
          if (payload === '[DONE]') continue;
          let chunk: OpenRouterChunk;
          try {
            chunk = JSON.parse(payload) as OpenRouterChunk;
          } catch {
            continue;
          }
          if (chunk.id && !generationId) generationId = chunk.id;
          if (chunk.model) resolvedModel = chunk.model;
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) {
            if (ttftMs === null) ttftMs = Date.now() - startedAt;
            text += delta;
          }
          if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
            outputTokens = chunk.usage.completion_tokens ?? outputTokens;
            cachedInputTokens = chunk.usage.prompt_tokens_details?.cached_tokens ?? cachedInputTokens;
          }
        }
      }
    }
  } catch (err) {
    clearTimeout(timer);
    const isAbort = err instanceof Error && err.name === 'AbortError';
    throw makeError(isAbort ? 'timeout' : 'unknown', `OpenRouter stream read failed: ${stringify(err)}`);
  }
  clearTimeout(timer);

  if (generationId) {
    scheduleGenMetaReconcile(generationId);
  }

  const meta: LlmCallMeta = {
    provider: 'openrouter',
    model: resolvedModel,
    generationId: generationId || null,
    latencyMs: Date.now() - startedAt,
    ttftMs,
  };

  return {
    text,
    usage: { inputTokens, outputTokens, cachedInputTokens },
    meta,
  };
}

function classifyHttp(status: number): LlmErrorCode {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'provider_error';
  if (status >= 400) return 'client_error';
  return 'unknown';
}

export class LlmCallError extends Error {
  readonly code: LlmErrorCode;
  constructor(code: LlmErrorCode, message: string) {
    super(message);
    this.name = 'LlmCallError';
    this.code = code;
  }
}

function makeError(code: LlmErrorCode, message: string): LlmCallError {
  return new LlmCallError(code, message);
}

function stringify(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
