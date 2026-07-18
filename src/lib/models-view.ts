// Pure derived helpers for the LLM model catalog — client-safe.
//
// No data-store / server-only imports here: ModelLeaderboard ("use client")
// imports from this module directly. The loader + in-memory cache stay in
// ./models, which re-exports these for server callers and tests.

import type { ModelMeta } from "./llm/types";

export type ModelSortKey =
  | "value"
  | "input_price"
  | "output_price"
  | "context"
  | "name"
  | "provider";

/**
 * A transparent capability-per-dollar heuristic used for the default sort.
 *
 * NOT a quality benchmark — we don't carry Artificial Analysis intelligence
 * indices in the seed, so this rewards declared capabilities (tools / vision
 * / reasoning) and context window, divided by a blended token price. Higher =
 * more capability per dollar. Free models get the capability score at the
 * lowest price band so they still rank on merit rather than dividing by zero.
 */
export function valueScore(m: ModelMeta): number {
  const capability =
    (m.supports_tools ? 1 : 0) +
    (m.supports_vision ? 1 : 0) +
    (m.supports_reasoning ? 1.5 : 0);
  // Context contributes a mild bonus on a log scale (128k vs 1M shouldn't
  // dominate capability).
  const ctx = m.context_length > 0 ? Math.log10(m.context_length) / 6 : 0;
  // Blend input+output; treat a $0 price as a small floor so free models
  // don't get an infinite score.
  const blendedPerM =
    (Math.max(0, m.input_price_per_million) +
      Math.max(0, m.output_price_per_million)) /
      2 || 0.05;
  const affordability = 1 / (1 + blendedPerM);
  return Math.round((capability + ctx + 0.5) * affordability * 1000) / 1000;
}

export interface ModelFilter {
  provider?: string;
  /** "tools" | "vision" | "reasoning" — require the capability when set. */
  capability?: "tools" | "vision" | "reasoning";
  /** Case-insensitive substring over name + model_id. */
  search?: string;
  /** Max blended (avg of input+output) USD/million tokens. */
  maxBlendedPrice?: number;
}

export function filterModels(models: ModelMeta[], f: ModelFilter): ModelMeta[] {
  const q = f.search?.trim().toLowerCase();
  return models.filter((m) => {
    if (f.provider && m.provider !== f.provider) return false;
    if (f.capability === "tools" && !m.supports_tools) return false;
    if (f.capability === "vision" && !m.supports_vision) return false;
    if (f.capability === "reasoning" && !m.supports_reasoning) return false;
    if (q && !(`${m.name} ${m.model_id}`.toLowerCase().includes(q))) return false;
    if (typeof f.maxBlendedPrice === "number") {
      const blended =
        (m.input_price_per_million + m.output_price_per_million) / 2;
      if (blended > f.maxBlendedPrice) return false;
    }
    return true;
  });
}

/**
 * Sort a copy of `models`. Default direction is the natural "best first" for
 * each key (value desc, price asc, context desc, name/provider asc). `dir`
 * flips it. Ties fall back to model_id for determinism.
 */
export function sortModels(
  models: ModelMeta[],
  key: ModelSortKey = "value",
  dir?: "asc" | "desc",
): ModelMeta[] {
  const naturalDesc = key === "value" || key === "context";
  const effectiveDir = dir ?? (naturalDesc ? "desc" : "asc");
  const mul = effectiveDir === "desc" ? -1 : 1;
  const val = (m: ModelMeta): number | string => {
    switch (key) {
      case "value":
        return valueScore(m);
      case "input_price":
        return m.input_price_per_million;
      case "output_price":
        return m.output_price_per_million;
      case "context":
        return m.context_length;
      case "name":
        return m.name.toLowerCase();
      case "provider":
        return m.provider.toLowerCase();
    }
  };
  return [...models].sort((a, b) => {
    const av = val(a);
    const bv = val(b);
    if (av < bv) return -1 * mul;
    if (av > bv) return 1 * mul;
    return a.model_id.localeCompare(b.model_id);
  });
}

export interface ProviderCount {
  provider: string;
  count: number;
}

/** Providers present in the catalog, with model counts, most models first. */
export function listProviders(models: ModelMeta[]): ProviderCount[] {
  const counts = new Map<string, number>();
  for (const m of models) counts.set(m.provider, (counts.get(m.provider) ?? 0) + 1);
  return [...counts.entries()]
    .map(([provider, count]) => ({ provider, count }))
    .sort((a, b) => b.count - a.count || a.provider.localeCompare(b.provider));
}
