#!/usr/bin/env node
// OpenRouter model catalog fetcher.
//
// Pulls https://openrouter.ai/api/v1/models (free, no auth, ~368 models)
// and produces:
//   - Per-PROVIDER aggregate entries (Anthropic, OpenAI, Mistral, Qwen, etc.)
//     each with min/max/avg per-token pricing across that provider's models
//     and a count of models. Dedupes against the seed by name.
//   - A flat models list saved alongside for a future "/agent-commerce/models"
//     comparison page.
//
// Output: .data/openrouter-enrichment.json
//   { fetchedAt, models: [...], normalizedProviders: [...] }

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

const SEED_PATH = resolve(
  process.cwd(),
  "apps/trendingrepo-worker/src/fetchers/agent-commerce/seed-data.json",
);
const OUT_PATH = resolve(
  process.cwd(),
  ".data/openrouter-enrichment.json",
);
const TIMEOUT_MS = parseNumberArg("--timeout-ms", 20_000);
const DRY_RUN = process.argv.includes("--dry-run");

function parseNumberArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx === process.argv.length - 1) return fallback;
  const n = parseInt(process.argv[idx + 1], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// Map provider id (from OpenRouter model.id) → display name + heuristic
// kind/category. The provider id is the part before the first slash.
const PROVIDER_DISPLAY = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google AI",
  "meta-llama": "Meta Llama",
  mistralai: "Mistral AI",
  qwen: "Qwen (Alibaba)",
  deepseek: "DeepSeek",
  "z-ai": "Zhipu AI",
  nvidia: "NVIDIA",
  "x-ai": "xAI Grok",
  minimax: "MiniMax",
  "arcee-ai": "Arcee AI",
  baidu: "Baidu ERNIE",
  nousresearch: "Nous Research",
  xiaomi: "Xiaomi MiMo",
  cohere: "Cohere",
  perplexity: "Perplexity",
  amazon: "Amazon Nova",
  inflection: "Inflection AI",
  liquid: "Liquid AI",
  microsoft: "Microsoft Phi",
  "01-ai": "01.AI Yi",
  thudm: "THUDM ChatGLM",
  ai21: "AI21 Labs",
  alibaba: "Alibaba Cloud",
};

const KNOWN_SEED_PROVIDERS = new Set([
  "openai", "anthropic", "google", "mistralai", "deepseek", "x-ai",
]); // OpenAI/Anthropic/Together/Fireworks/Groq are already in seed; skip dup.

function normalizeProvider(providerId, models) {
  const prices = models
    .map((m) => parseFloat(m.pricing?.prompt ?? "NaN"))
    .filter((n) => Number.isFinite(n) && n >= 0);
  const completionPrices = models
    .map((m) => parseFloat(m.pricing?.completion ?? "NaN"))
    .filter((n) => Number.isFinite(n) && n >= 0);
  const minPrompt = prices.length ? Math.min(...prices) : null;
  const maxPrompt = prices.length ? Math.max(...prices) : null;
  const avgPrompt =
    prices.length > 0
      ? prices.reduce((a, b) => a + b, 0) / prices.length
      : null;

  const free = models.filter(
    (m) => parseFloat(m.pricing?.prompt ?? "0") === 0,
  ).length;
  const supportsTools = models.filter((m) =>
    (m.supported_parameters ?? []).includes("tools"),
  ).length;
  const totalContext = models.reduce(
    (a, m) => Math.max(a, m.context_length ?? 0),
    0,
  );
  const display = PROVIDER_DISPLAY[providerId] ?? providerId;

  // Pricing display
  const fmt = (p) =>
    p === null
      ? "—"
      : p === 0
        ? "$0"
        : p < 0.0001
          ? `$${(p * 1_000_000).toFixed(2)}/M`
          : `$${(p * 1_000_000).toFixed(2)}/M`;
  const priceRange =
    minPrompt !== null && maxPrompt !== null
      ? minPrompt === maxPrompt
        ? fmt(minPrompt)
        : `${fmt(minPrompt)} – ${fmt(maxPrompt)}`
      : "—";

  return {
    name: display,
    kind: "api",
    category: "inference",
    brief: `${models.length} models on OpenRouter — ${free} free, ${supportsTools} with tool-calling, max context ${totalContext.toLocaleString("en-US")}.`,
    protocols: ["http", "rest"],
    pricing: {
      type: avgPrompt === 0 ? "free" : "per_call",
      value: priceRange,
      currency: "USD",
    },
    capabilities: [
      "llm",
      "inference",
      ...(supportsTools > 0 ? ["tool-calling"] : []),
      ...(models.some((m) =>
        (m.architecture?.input_modalities ?? []).includes("image"),
      )
        ? ["vision"]
        : []),
      ...(models.some((m) =>
        (m.architecture?.input_modalities ?? []).includes("audio"),
      )
        ? ["audio"]
        : []),
    ],
    links: {
      website: `https://openrouter.ai/${providerId}`,
      docs: "https://openrouter.ai/docs",
    },
    badges: {
      agentActionable: true,
      verified: true,
    },
    stars7dDelta: 0,
    sources: [
      {
        source: "manual",
        url: `https://openrouter.ai/${providerId}`,
        signalScore: Math.min(85, 30 + Math.log10(models.length + 1) * 24),
      },
    ],
    tags: [
      "llm",
      "inference",
      "openrouter",
      ...(free > 0 ? ["has-free-tier"] : []),
    ],
    _openrouter: {
      providerId,
      modelCount: models.length,
      freeCount: free,
      toolCallCount: supportsTools,
      maxContext: totalContext,
      minPromptUsd: minPrompt,
      maxPromptUsd: maxPrompt,
      avgPromptUsd: avgPrompt,
      avgCompletionUsd:
        completionPrices.length > 0
          ? completionPrices.reduce((a, b) => a + b, 0) /
            completionPrices.length
          : null,
      slug: slugify(display),
    },
  };
}

async function main() {
  console.log(
    `[ac-or] fetching openrouter.ai/api/v1/models (timeout=${TIMEOUT_MS}ms)`,
  );
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let data;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        Accept: "application/json",
        "User-Agent": "TrendingRepo-AC-OpenRouter/0.1",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    data = await res.json();
  } finally {
    clearTimeout(t);
  }

  const models = data.data ?? data.models ?? [];
  console.log(`[ac-or] received ${models.length} models`);

  // Group by provider
  const byProvider = new Map();
  for (const m of models) {
    const provider = String(m.id ?? "").split("/")[0];
    if (!provider) continue;
    if (!byProvider.has(provider)) byProvider.set(provider, []);
    byProvider.get(provider).push(m);
  }
  console.log(`[ac-or] ${byProvider.size} unique providers`);

  // Dedupe against seed by display-slug.
  const seed = JSON.parse(readFileSync(SEED_PATH, "utf8"));
  const seenSlug = new Set(seed.entries.map((e) => slugify(e.name)));

  const normalized = [];
  for (const [providerId, providerModels] of byProvider) {
    if (KNOWN_SEED_PROVIDERS.has(providerId)) continue; // already in seed
    if (providerModels.length < 2) continue; // long-tail noise
    const built = normalizeProvider(providerId, providerModels);
    if (seenSlug.has(built._openrouter.slug)) continue;
    normalized.push(built);
  }

  normalized.sort(
    (a, b) =>
      (b._openrouter.modelCount ?? 0) - (a._openrouter.modelCount ?? 0),
  );

  console.log("");
  console.log("[ac-or] top normalized providers:");
  for (const n of normalized.slice(0, 12)) {
    console.log(
      `  ${n._openrouter.modelCount.toString().padStart(3)} models  ${n.name.padEnd(24)}  ${n.pricing.value}`,
    );
  }

  if (DRY_RUN) {
    console.log("[ac-or] --dry-run — nothing written.");
    return;
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        sourceCount: models.length,
        providerCount: byProvider.size,
        normalizedCount: normalized.length,
        models, // raw passthrough for the future /models comparison page
        normalized,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`[ac-or] wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("[ac-or] fatal:", err);
  process.exit(1);
});
