// lint-allow: no-parsebody — Vercel Cron POST trigger with empty body, no payload to validate.
// Daily refresh of OpenRouter's model catalogue.
//
// Pulls https://openrouter.ai/api/v1/models, normalizes to ModelMeta[],
// and writes the result to the data-store at key 'llm-model-metadata'.
// The aggregator route reads this for cost-estimate fallbacks; the
// /model-usage page reads it to render context-length / pricing in the
// model cards.
//
// Auth: CRON_SECRET bearer (verifyCronAuth).
// Frequency: daily — model catalogue churn is slow.

import { NextRequest, NextResponse } from "next/server";

import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import { getDataStore } from "@/lib/data-store";
import type { ModelMeta, ModelMetadataPayload } from "@/lib/llm/types";

export const runtime = "nodejs";

const ENDPOINT = "https://openrouter.ai/api/v1/models";
const NO_STORE = { "Cache-Control": "no-store" } as const;

interface OpenRouterModel {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    instruct_type?: string | null;
    tokenizer?: string;
  };
  pricing?: {
    prompt?: string | number;
    completion?: string | number;
  };
  supported_parameters?: string[];
  top_provider?: {
    context_length?: number;
    is_moderated?: boolean;
  };
}

function toModelMeta(m: OpenRouterModel, syncedAt: string): ModelMeta {
  // OpenRouter prices come back as USD-per-token strings. Multiply by 1e6 to
  // surface as USD per million tokens, the unit we display.
  const promptUsdPerToken = parseNum(m.pricing?.prompt);
  const completionUsdPerToken = parseNum(m.pricing?.completion);

  const inputModalities = new Set(m.architecture?.input_modalities ?? []);
  const supportedParams = new Set(m.supported_parameters ?? []);

  // OpenRouter encodes provider as the prefix of `id` ('anthropic/...').
  const slashIndex = m.id.indexOf('/');
  const provider = slashIndex > 0 ? m.id.slice(0, slashIndex) : 'unknown';

  return {
    model_id: m.id,
    name: m.name ?? m.id,
    provider,
    context_length: m.top_provider?.context_length ?? m.context_length ?? 0,
    input_price_per_million: promptUsdPerToken * 1_000_000,
    output_price_per_million: completionUsdPerToken * 1_000_000,
    supports_tools: supportedParams.has('tools') || supportedParams.has('tool_choice'),
    supports_vision: inputModalities.has('image'),
    // OpenRouter doesn't expose a single 'reasoning' flag; infer from
    // either supported_parameters or the model name as a best-effort hint.
    supports_reasoning:
      supportedParams.has('reasoning')
      || /reasoning|o1|o3|deepseek-r1|qwq|kimi-k2/i.test(m.id),
    last_synced_at: syncedAt,
  };
}

function parseNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

async function syncModels(): Promise<{ count: number; syncedAt: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  // The /models endpoint is public, but sending the API key when we have
  // it means OpenRouter can attribute the call to our app and may surface
  // additional fields in the future.
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch(ENDPOINT, { method: 'GET', headers, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(`OpenRouter /models returned ${res.status}`);
  }
  const json = (await res.json()) as { data?: OpenRouterModel[] };
  const list = Array.isArray(json.data) ? json.data : [];
  const syncedAt = new Date().toISOString();
  const models = list
    .filter((m): m is OpenRouterModel => typeof m?.id === 'string' && m.id.length > 0)
    .map((m) => toModelMeta(m, syncedAt));

  const payload: ModelMetadataPayload = { syncedAt, models };
  const store = getDataStore();
  await store.write('llm-model-metadata', payload);
  return { count: models.length, syncedAt };
}

export async function POST(request: NextRequest) {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny;
  try {
    const result = await syncModels();
    return NextResponse.json(
      { ok: true as const, ...result },
      { headers: NO_STORE },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:cron:llm:sync-models] failed', err);
    return NextResponse.json(
      { ok: false as const, error: message },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
