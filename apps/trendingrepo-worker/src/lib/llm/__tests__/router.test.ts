// Unit tests for the LLM router's provider-fallback path.
//
// Contract:
//   (1) primary success → fallback never invoked; exactly one `ok` event.
//   (2) primary fails with a retryable error (Kimi 403 quota) AND a distinct
//       fallback is configured → fallback served; two events (error→ok); the
//       returned result is the fallback provider's.
//   (3) primary fails but NO fallback configured → rethrows; one error event.
//   (4) primary fails with a NON-retryable error (400 client_error) → fallback
//       never invoked even though one is configured; rethrows.
//   (5) fallback named but its key is missing → treated as not-configured;
//       rethrows without calling the fallback client.
//
// Every provider client + the env loader + the telemetry recorder is mocked,
// so the test touches no network, redis, or real keys.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LlmCallResult } from '../shared.js';

// Mutable env returned by the mocked loadEnv — reset per test.
const env = vi.hoisted(() => ({ current: {} as Record<string, string | undefined> }));
const callKimiMock = vi.hoisted(() => vi.fn());
const callNanoGptMock = vi.hoisted(() => vi.fn());
const callOpenRouterMock = vi.hoisted(() => vi.fn());
const recordLlmEventMock = vi.hoisted(() => vi.fn());

vi.mock('../../env.js', () => ({
  loadEnv: () => env.current,
}));

vi.mock('../kimi-client.js', () => ({
  callKimi: callKimiMock,
  isKimiConfigured: () => Boolean(env.current.KIMI_API_KEY),
}));

vi.mock('../nanogpt-client.js', () => ({
  callNanoGpt: callNanoGptMock,
  isNanoGptConfigured: () => Boolean(env.current.NANOGPT_API_KEY),
}));

vi.mock('../openrouter-client.js', () => {
  class LlmCallError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = 'LlmCallError';
      this.code = code;
    }
  }
  return { callOpenRouter: callOpenRouterMock, LlmCallError };
});

vi.mock('../usage-recorder.js', () => ({
  recordLlmEvent: recordLlmEventMock,
  hashUserId: () => null,
}));

const telemetry = { feature: 'ai_analyst', task_type: 'item', request_id: 'test-req' } as const;

async function loadCallLlm() {
  const mod = await import('../router.js');
  return mod.callLlm;
}

function fakeResult(provider: 'kimi' | 'nanogpt' | 'openrouter'): LlmCallResult {
  return {
    text: '{"ok":true}',
    usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0 },
    meta: {
      provider,
      model: provider === 'nanogpt' ? 'moonshotai/kimi-k2.6' : 'kimi-for-coding',
      generationId: null,
      latencyMs: 1,
      ttftMs: 1,
    },
  };
}

/** Simulate the OpenAI SDK's APIError shape (carries an HTTP `.status`). */
function apiError(status: number): Error {
  return Object.assign(new Error(`http ${status}`), { status });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  env.current = {};
});

describe('callLlm provider fallback', () => {
  it('serves the primary and never touches the fallback on success', async () => {
    const callLlm = await loadCallLlm();
    env.current = { LLM_PROVIDER: 'kimi', LLM_FALLBACK_PROVIDER: 'nanogpt', KIMI_API_KEY: 'k', NANOGPT_API_KEY: 'n' };
    callKimiMock.mockResolvedValueOnce(fakeResult('kimi'));

    const r = await callLlm({ systemPrompt: 's', userMessage: 'u' }, telemetry);

    expect(r.meta.provider).toBe('kimi');
    expect(callKimiMock).toHaveBeenCalledTimes(1);
    expect(callNanoGptMock).not.toHaveBeenCalled();
    expect(recordLlmEventMock).toHaveBeenCalledTimes(1);
    expect(recordLlmEventMock.mock.calls[0]?.[0]).toMatchObject({ status: 'ok', provider: 'kimi' });
  });

  it('falls back to NanoGPT on a Kimi 403 quota error and records both attempts', async () => {
    const callLlm = await loadCallLlm();
    env.current = { LLM_PROVIDER: 'kimi', LLM_FALLBACK_PROVIDER: 'nanogpt', KIMI_API_KEY: 'k', NANOGPT_API_KEY: 'n' };
    callKimiMock.mockRejectedValueOnce(apiError(403));
    callNanoGptMock.mockResolvedValueOnce(fakeResult('nanogpt'));

    const r = await callLlm({ systemPrompt: 's', userMessage: 'u' }, telemetry);

    expect(r.meta.provider).toBe('nanogpt');
    expect(callKimiMock).toHaveBeenCalledTimes(1);
    expect(callNanoGptMock).toHaveBeenCalledTimes(1);
    expect(recordLlmEventMock).toHaveBeenCalledTimes(2);
    expect(recordLlmEventMock.mock.calls[0]?.[0]).toMatchObject({ status: 'error', provider: 'kimi', error_code: 'auth' });
    expect(recordLlmEventMock.mock.calls[1]?.[0]).toMatchObject({ status: 'ok', provider: 'nanogpt' });
  });

  it('rethrows when no fallback is configured', async () => {
    const callLlm = await loadCallLlm();
    env.current = { LLM_PROVIDER: 'kimi', KIMI_API_KEY: 'k' };
    callKimiMock.mockRejectedValueOnce(apiError(403));

    await expect(callLlm({ systemPrompt: 's', userMessage: 'u' }, telemetry)).rejects.toThrow();
    expect(callNanoGptMock).not.toHaveBeenCalled();
    expect(recordLlmEventMock).toHaveBeenCalledTimes(1);
    expect(recordLlmEventMock.mock.calls[0]?.[0]).toMatchObject({ status: 'error', provider: 'kimi' });
  });

  it('does NOT fall back on a non-retryable client error (400)', async () => {
    const callLlm = await loadCallLlm();
    env.current = { LLM_PROVIDER: 'kimi', LLM_FALLBACK_PROVIDER: 'nanogpt', KIMI_API_KEY: 'k', NANOGPT_API_KEY: 'n' };
    callKimiMock.mockRejectedValueOnce(apiError(400));

    await expect(callLlm({ systemPrompt: 's', userMessage: 'u' }, telemetry)).rejects.toThrow();
    expect(callNanoGptMock).not.toHaveBeenCalled();
    expect(recordLlmEventMock.mock.calls[0]?.[0]).toMatchObject({ status: 'error', error_code: 'client_error' });
  });

  it('rethrows when the fallback provider is named but its key is missing', async () => {
    const callLlm = await loadCallLlm();
    env.current = { LLM_PROVIDER: 'kimi', LLM_FALLBACK_PROVIDER: 'nanogpt', KIMI_API_KEY: 'k' };
    callKimiMock.mockRejectedValueOnce(apiError(429));

    await expect(callLlm({ systemPrompt: 's', userMessage: 'u' }, telemetry)).rejects.toThrow();
    expect(callNanoGptMock).not.toHaveBeenCalled();
  });
});
