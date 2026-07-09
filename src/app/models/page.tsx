// /models — public LLM model leaderboard.
//
// Surfaces the model catalog we already collect (OpenRouter, synced live in
// prod via /api/cron/llm/sync-models -> Redis llm-model-metadata; a curated
// seed backs the cold start). Sortable/filterable by provider, capability,
// context, and price, with a transparent capability-per-dollar "value" score.

import type { Metadata } from "next";

import { PageHead } from "@/components/ui/PageHead";
import { KpiBand, type KpiCell } from "@/components/ui/KpiBand";
import { ModelLeaderboard } from "@/components/models/ModelLeaderboard";
import {
  getModels,
  getModelsSyncedAt,
  listProviders,
  refreshModelsFromStore,
} from "@/lib/models";

export const revalidate = 1800;

export const metadata: Metadata = {
  title: "TrendingRepo — LLM Model Leaderboard",
  description:
    "Compare large language models by provider, context window, token pricing, and capabilities (reasoning, vision, tools). Live catalog sourced from OpenRouter.",
  keywords: [
    "LLM leaderboard",
    "model comparison",
    "openrouter models",
    "llm pricing",
    "context window",
    "reasoning models",
    "cheapest llm",
    "claude gpt gemini llama pricing",
  ],
  alternates: { canonical: "/models" },
};

function cheapest(models: ReturnType<typeof getModels>): string {
  const priced = models.filter((m) => m.input_price_per_million > 0);
  if (priced.length === 0) return "—";
  const min = priced.reduce((a, b) =>
    a.input_price_per_million <= b.input_price_per_million ? a : b,
  );
  return `$${min.input_price_per_million.toFixed(2)}/M`;
}

function longestContext(models: ReturnType<typeof getModels>): string {
  const max = models.reduce(
    (a, b) => (a.context_length >= b.context_length ? a : b),
    models[0] ?? { context_length: 0 },
  );
  const n = max.context_length;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

export default async function ModelsPage() {
  await refreshModelsFromStore();
  const models = getModels();
  const providers = listProviders(models);
  const syncedAt = getModelsSyncedAt();

  const kpis: KpiCell[] = [
    { label: "Models", value: String(models.length), tone: "acc" },
    { label: "Providers", value: String(providers.length) },
    { label: "Cheapest input", value: cheapest(models), tone: "money" },
    { label: "Longest context", value: longestContext(models) },
  ];

  const syncedLabel = syncedAt
    ? new Date(syncedAt).toISOString().replace("T", " ").slice(0, 16) + " UTC"
    : "—";

  return (
    <main className="v4-page">
      <PageHead
        crumb={<><b>MODELS</b> · LLM · /MODELS</>}
        h1="LLM Model Leaderboard"
        lede={
          <>
            Every model we track — provider, context window, token pricing, and
            capabilities — in one sortable board. Catalog synced from OpenRouter;
            “value” is a capability-per-dollar heuristic, not a quality benchmark.
          </>
        }
        clock={<span className="v4-mono-dim">synced {syncedLabel}</span>}
      />

      <KpiBand cells={kpis} className="v4-section" />

      <section className="v4-section" aria-label="Model leaderboard">
        <ModelLeaderboard models={models} />
      </section>
    </main>
  );
}
