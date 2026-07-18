// Tests for the public model-catalog pure helpers (sort/filter/value/
// providers). No I/O — the data-store refresh path is exercised via the
// route integration, not here.

import { test } from "node:test";
import assert from "node:assert/strict";

import type { ModelMeta } from "../llm/types";
import {
  filterModels,
  listProviders,
  sortModels,
  valueScore,
} from "../model-helpers";

function m(overrides: Partial<ModelMeta> & { model_id: string }): ModelMeta {
  return {
    model_id: overrides.model_id,
    name: overrides.name ?? overrides.model_id,
    provider: overrides.provider ?? overrides.model_id.split("/")[0] ?? "x",
    context_length: overrides.context_length ?? 128_000,
    input_price_per_million: overrides.input_price_per_million ?? 1,
    output_price_per_million: overrides.output_price_per_million ?? 2,
    supports_tools: overrides.supports_tools ?? false,
    supports_vision: overrides.supports_vision ?? false,
    supports_reasoning: overrides.supports_reasoning ?? false,
    last_synced_at: "2026-07-09T00:00:00.000Z",
  };
}

test("valueScore: cheaper + more capable ranks higher; free models don't blow up", () => {
  const cheapCapable = valueScore(
    m({ model_id: "a/a", input_price_per_million: 0.2, output_price_per_million: 0.4, supports_tools: true, supports_reasoning: true }),
  );
  const priceyBare = valueScore(
    m({ model_id: "b/b", input_price_per_million: 15, output_price_per_million: 75 }),
  );
  assert.ok(cheapCapable > priceyBare, `${cheapCapable} !> ${priceyBare}`);
  const free = valueScore(
    m({ model_id: "c/c", input_price_per_million: 0, output_price_per_million: 0 }),
  );
  assert.ok(Number.isFinite(free) && free > 0);
});

test("sortModels: value sorts desc by default, price asc, deterministic ties", () => {
  const models = [
    m({ model_id: "z/z", input_price_per_million: 5, output_price_per_million: 5 }),
    m({ model_id: "a/a", input_price_per_million: 5, output_price_per_million: 5 }),
    m({ model_id: "m/m", input_price_per_million: 1, output_price_per_million: 1 }),
  ];
  const byInputAsc = sortModels(models, "input_price").map((x) => x.model_id);
  assert.deepEqual(byInputAsc, ["m/m", "a/a", "z/z"]); // 1 first; ties by id
  const byInputDesc = sortModels(models, "input_price", "desc").map((x) => x.model_id);
  assert.equal(byInputDesc[0], "a/a"); // both 5, id tiebreak -> a before z at top? desc reverses
  // value is desc by default -> the cheapest (m/m) has the best value
  assert.equal(sortModels(models, "value")[0]!.model_id, "m/m");
});

test("sortModels does not mutate the input array", () => {
  const models = [m({ model_id: "b/b" }), m({ model_id: "a/a" })];
  const before = models.map((x) => x.model_id);
  sortModels(models, "name");
  assert.deepEqual(models.map((x) => x.model_id), before);
});

test("filterModels: provider + capability + search", () => {
  const models = [
    m({ model_id: "anthropic/claude", provider: "anthropic", supports_reasoning: true }),
    m({ model_id: "openai/gpt", provider: "openai", supports_vision: true }),
    m({ model_id: "anthropic/haiku", provider: "anthropic" }),
  ];
  assert.equal(filterModels(models, { provider: "anthropic" }).length, 2);
  assert.deepEqual(
    filterModels(models, { capability: "reasoning" }).map((x) => x.model_id),
    ["anthropic/claude"],
  );
  assert.deepEqual(
    filterModels(models, { search: "GPT" }).map((x) => x.model_id),
    ["openai/gpt"],
  );
  assert.deepEqual(
    filterModels(models, { maxBlendedPrice: 0 }).map((x) => x.model_id),
    [],
  );
});

test("listProviders: counts, most models first", () => {
  const models = [
    m({ model_id: "a/1", provider: "a" }),
    m({ model_id: "a/2", provider: "a" }),
    m({ model_id: "b/1", provider: "b" }),
  ];
  assert.deepEqual(listProviders(models), [
    { provider: "a", count: 2 },
    { provider: "b", count: 1 },
  ]);
});

test("the bundled seed loads and is non-empty with valid shapes", async () => {
  // Import the module's live cache (seeded from data/llm-model-metadata.json).
  const { getModels, getModelsSyncedAt } = await import("../models");
  const models = getModels();
  assert.ok(models.length > 0, "seed should carry models");
  assert.ok(getModelsSyncedAt().length > 0);
  for (const mm of models) {
    assert.equal(typeof mm.model_id, "string");
    assert.ok(mm.model_id.length > 0);
    assert.equal(typeof mm.input_price_per_million, "number");
    assert.ok(mm.context_length >= 0);
  }
});
