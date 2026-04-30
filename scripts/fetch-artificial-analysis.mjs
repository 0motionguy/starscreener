#!/usr/bin/env node
// Artificial Analysis API fetcher.
//
// Source: https://artificialanalysis.ai/api/v2/data/llms/models
//   Free API tier — requires AA_API_KEY env (sign up at
//   artificialanalysis.ai/documentation), header `x-api-key`. Attribution
//   to artificialanalysis.ai required when using their data.
//
// Output: .data/artificial-analysis-enrichment.json
//   { fetchedAt, models: [...], byModelCreator: { creator: { models, avgIntelligence, ... } } }
//
// Per-model fields:
//   id, name, slug, model_creator
//   evaluations: { artificial_analysis_intelligence_index, coding_index, math_index }
//   pricing: { price_1m_blended_3_to_1, price_1m_input_tokens, price_1m_output_tokens }
//   median_output_tokens_per_second, median_time_to_first_token_seconds

import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

const OUT_PATH = resolve(
  process.cwd(),
  ".data/artificial-analysis-enrichment.json",
);
const TIMEOUT_MS = parseNumberArg("--timeout-ms", 25_000);
const DRY_RUN = process.argv.includes("--dry-run");
const API_KEY =
  process.env.AA_API_KEY ?? process.env.ARTIFICIAL_ANALYSIS_API_KEY ?? "";

function parseNumberArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx === process.argv.length - 1) return fallback;
  const n = parseInt(process.argv[idx + 1], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main() {
  if (!API_KEY) {
    console.warn(
      "[ac-aa] AA_API_KEY env not set — get one at https://artificialanalysis.ai/documentation",
    );
    console.warn("[ac-aa] writing empty enrichment so the build step no-ops cleanly.");
    if (!DRY_RUN) {
      mkdirSync(dirname(OUT_PATH), { recursive: true });
      writeFileSync(
        OUT_PATH,
        JSON.stringify(
          {
            fetchedAt: new Date().toISOString(),
            note: "AA_API_KEY missing — no live data fetched.",
            models: [],
            byModelCreator: {},
          },
          null,
          2,
        ),
        "utf8",
      );
    }
    return;
  }

  console.log("[ac-aa] fetching artificialanalysis.ai/api/v2/data/llms/models");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let body;
  try {
    const res = await fetch(
      "https://artificialanalysis.ai/api/v2/data/llms/models",
      {
        headers: {
          "x-api-key": API_KEY,
          Accept: "application/json",
          "User-Agent": "TrendingRepo-AC-AA/0.1 (+https://trendingrepo.com)",
        },
        signal: ctrl.signal,
      },
    );
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    body = await res.json();
  } finally {
    clearTimeout(t);
  }

  const models = body?.data ?? [];
  console.log(`[ac-aa] received ${models.length} models`);

  // Aggregate by model_creator (e.g. "anthropic" → avg intelligence, fastest, cheapest)
  const byCreator = new Map();
  for (const m of models) {
    const creatorId = m?.model_creator?.slug ?? m?.model_creator?.id ?? null;
    if (!creatorId) continue;
    if (!byCreator.has(creatorId)) {
      byCreator.set(creatorId, {
        creator: m.model_creator,
        models: [],
      });
    }
    byCreator.get(creatorId).models.push(m);
  }

  function avg(arr) {
    if (arr.length === 0) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  const aggregates = {};
  for (const [creatorId, entry] of byCreator) {
    const intel = entry.models
      .map(
        (m) => m?.evaluations?.artificial_analysis_intelligence_index ?? null,
      )
      .filter((n) => Number.isFinite(n));
    const coding = entry.models
      .map((m) => m?.evaluations?.coding_index ?? null)
      .filter((n) => Number.isFinite(n));
    const math = entry.models
      .map((m) => m?.evaluations?.math_index ?? null)
      .filter((n) => Number.isFinite(n));
    const speed = entry.models
      .map((m) => m?.median_output_tokens_per_second ?? null)
      .filter((n) => Number.isFinite(n));
    const ttft = entry.models
      .map((m) => m?.median_time_to_first_token_seconds ?? null)
      .filter((n) => Number.isFinite(n));
    const blendedPrice = entry.models
      .map((m) => m?.pricing?.price_1m_blended_3_to_1 ?? null)
      .filter((n) => Number.isFinite(n) && n > 0);

    aggregates[creatorId] = {
      creatorId,
      creatorName: entry.creator?.name ?? creatorId,
      modelCount: entry.models.length,
      avgIntelligenceIndex: avg(intel),
      maxIntelligenceIndex: intel.length ? Math.max(...intel) : null,
      avgCodingIndex: avg(coding),
      avgMathIndex: avg(math),
      medianTokensPerSec: avg(speed),
      medianTtftSeconds: avg(ttft),
      minPriceUsdPer1M: blendedPrice.length ? Math.min(...blendedPrice) : null,
      maxPriceUsdPer1M: blendedPrice.length ? Math.max(...blendedPrice) : null,
      slug: creatorId,
    };
  }

  console.log("");
  console.log("[ac-aa] top creators by max intelligence:");
  const ranked = Object.values(aggregates).sort(
    (a, b) =>
      (b.maxIntelligenceIndex ?? 0) - (a.maxIntelligenceIndex ?? 0),
  );
  for (const r of ranked.slice(0, 10)) {
    console.log(
      `  ${(r.creatorName ?? "").padEnd(20)} ` +
        `intel=${(r.maxIntelligenceIndex ?? 0).toFixed(0).padStart(3)} ` +
        `coding=${(r.avgCodingIndex ?? 0).toFixed(0).padStart(3)} ` +
        `tps=${(r.medianTokensPerSec ?? 0).toFixed(0).padStart(4)} ` +
        `$${(r.minPriceUsdPer1M ?? 0).toFixed(2)}/M`,
    );
  }

  if (DRY_RUN) {
    console.log("[ac-aa] --dry-run — nothing written.");
    return;
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        modelCount: models.length,
        creatorCount: byCreator.size,
        models, // raw passthrough
        byModelCreator: aggregates,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`[ac-aa] wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("[ac-aa] fatal:", err);
  process.exit(1);
});
