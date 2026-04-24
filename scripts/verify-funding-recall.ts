// One-off probe: measure the funding-match recall delta from wave 5
// (stub enrichment + alias expansion).
//
// Three passes:
//   1. BEFORE — real funding-news.json against a candidate set that has
//      homepageUrl stripped on every stub (simulates the wave-4 baseline)
//      and ONLY the original 34 alias entries (simulates wave-3 registry).
//   2. AFTER — real funding-news.json against the current on-disk state
//      (244 homepages filled on stubs + 61 alias entries).
//   3. SYNTHETIC — a hand-curated panel of company_name / website pairs
//      for every new alias we shipped, proving the aliases wire end-to-end.
//      This is the "will recall lift once funding-news surfaces these
//      companies" upper bound.
//
// Run:
//   npx tsx scripts/verify-funding-recall.ts

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getFundingAliasRegistry } from "../src/lib/funding/aliases";
import {
  matchFundingEventToRepo,
  type FundingMatchReason,
  type RepoCandidate,
} from "../src/lib/funding/match";
import type { FundingNewsFile, FundingSignal } from "../src/lib/funding/types";
import type { RepoMetadata } from "../src/lib/repo-metadata";

const REPO_METADATA_PATH = resolve(process.cwd(), "data", "repo-metadata.json");
const FUNDING_NEWS_PATH = resolve(process.cwd(), "data", "funding-news.json");

const CONFIDENCE_FLOOR = 0.6;

interface Counts {
  total: number;
  byReason: Record<FundingMatchReason, number>;
}

function zeroCounts(): Counts {
  return {
    total: 0,
    byReason: {
      domain: 0,
      alias: 0,
      company_name_exact: 0,
      company_name_fuzzy: 0,
    },
  };
}

function loadRepoMetadata(): RepoMetadata[] {
  const raw = readFileSync(REPO_METADATA_PATH, "utf8");
  const parsed = JSON.parse(raw) as { items?: RepoMetadata[] };
  return parsed.items ?? [];
}

function loadFundingNews(): FundingNewsFile {
  const raw = readFileSync(FUNDING_NEWS_PATH, "utf8");
  return JSON.parse(raw) as FundingNewsFile;
}

function buildCandidatesWithoutEnrichment(
  metas: RepoMetadata[],
): RepoCandidate[] {
  // Simulates pre-wave-5 state: every stub has homepageUrl stripped, no
  // alias registry. Non-stub items keep their homepage (the scraper has
  // always filled those).
  return metas.map((meta) => ({
    fullName: meta.fullName,
    homepage:
      (meta as unknown as { source?: string }).source === "pipeline-jsonl-stub"
        ? null
        : (meta.homepageUrl ?? null),
    aliases: [],
    ownerDomain: null,
  }));
}

function buildCandidatesCurrentState(metas: RepoMetadata[]): RepoCandidate[] {
  const registry = getFundingAliasRegistry();
  return metas.map((meta) => {
    const entry = registry.get(meta.fullName.toLowerCase());
    return {
      fullName: meta.fullName,
      homepage: meta.homepageUrl ?? null,
      aliases: entry?.aliases ?? [],
      ownerDomain: entry?.domains[0] ?? null,
    };
  });
}

function runMatcher(
  signals: FundingSignal[],
  candidates: RepoCandidate[],
): Counts {
  const counts = zeroCounts();
  for (const signal of signals) {
    const result = matchFundingEventToRepo(signal, candidates);
    if (!result) continue;
    if (result.confidence < CONFIDENCE_FLOOR) continue;
    counts.total++;
    counts.byReason[result.reason]++;
  }
  return counts;
}

function synthSignal(
  id: string,
  companyName: string,
  companyWebsite: string | null,
): FundingSignal {
  return {
    id: `synthetic-${id}`,
    headline: `${companyName} raises $100M`,
    description: "",
    sourceUrl: "",
    sourcePlatform: "techcrunch",
    publishedAt: "2026-04-23T00:00:00Z",
    discoveredAt: "2026-04-23T00:00:00Z",
    extracted: {
      companyName,
      companyWebsite,
      companyLogoUrl: null,
      amount: 100_000_000,
      amountDisplay: "$100M",
      currency: "USD",
      roundType: "series-d-plus",
      investors: [],
      investorsEnriched: [],
      confidence: "high",
    },
    tags: [],
  };
}

function main(): void {
  const metas = loadRepoMetadata();
  const file = loadFundingNews();
  const signals = file.signals ?? [];

  const registry = getFundingAliasRegistry();
  console.log(
    `[verify-funding-recall] signals=${signals.length} repos=${metas.length} aliasRegistry=${registry.size}`,
  );
  const stubCount = metas.filter(
    (m) => (m as unknown as { source?: string }).source === "pipeline-jsonl-stub",
  ).length;
  const stubsWithHome = metas.filter(
    (m) =>
      (m as unknown as { source?: string }).source === "pipeline-jsonl-stub" &&
      m.homepageUrl,
  ).length;
  console.log(
    `[verify-funding-recall] stub coverage: ${stubsWithHome}/${stubCount} stubs have homepageUrl`,
  );

  // Pass 1: real funding-news, wave-4 baseline.
  const before = runMatcher(signals, buildCandidatesWithoutEnrichment(metas));
  // Pass 2: real funding-news, current state.
  const after = runMatcher(signals, buildCandidatesCurrentState(metas));

  console.log(`\nPass 1 — real funding-news, WAVE-4 baseline:`);
  console.log(`  total: ${before.total}`);
  for (const k of Object.keys(before.byReason) as FundingMatchReason[]) {
    console.log(`  ${k}: ${before.byReason[k]}`);
  }
  console.log(`\nPass 2 — real funding-news, CURRENT STATE:`);
  console.log(`  total: ${after.total}`);
  for (const k of Object.keys(after.byReason) as FundingMatchReason[]) {
    console.log(`  ${k}: ${after.byReason[k]}`);
  }
  console.log(
    `\ndelta: ${after.total - before.total} (+${after.byReason.domain - before.byReason.domain} domain, +${after.byReason.alias - before.byReason.alias} alias)`,
  );

  // Pass 3: synthetic. Exercise every newly-added alias entry — proves the
  // aliases wire end-to-end, and measures the upper-bound recall lift if
  // funding-news were to surface these companies.
  console.log(`\nPass 3 — SYNTHETIC signals for every alias entry:`);
  const candidates = buildCandidatesCurrentState(metas);
  const panel: Array<{ name: string; website: string | null }> = [
    // Wave-5 additions (new).
    { name: "PyTorch", website: "https://pytorch.org" },
    { name: "TensorFlow", website: null },
    { name: "ClickHouse", website: "https://clickhouse.com" },
    { name: "Dagster", website: null },
    { name: "dbt Labs", website: "https://getdbt.com" },
    { name: "MindsDB", website: null },
    { name: "Metabase", website: "https://metabase.com" },
    { name: "DragonflyDB", website: null },
    { name: "ScyllaDB", website: "https://scylladb.com" },
    { name: "PingCAP", website: null },
    { name: "Starburst", website: "https://starburst.io" },
    { name: "QuestDB", website: null },
    { name: "Streamlit", website: "https://streamlit.io" },
    { name: "Gradio", website: null },
    { name: "Prefect", website: null },
    { name: "Mysten Labs", website: null },
    { name: "Solana Labs", website: null },
    { name: "Aptos", website: null },
    { name: "DuckDB", website: null },
    { name: "Turso", website: "https://turso.tech" },
    { name: "Neo4j", website: null },
    { name: "MongoDB", website: null },
    { name: "InfluxData", website: null },
    { name: "Tauri", website: "https://tauri.app" },
    { name: "Zed Industries", website: null },
    { name: "ComfyUI", website: null },
    { name: "Open WebUI", website: null },
  ];
  let syntheticHits = 0;
  const missed: string[] = [];
  for (const c of panel) {
    const signal = synthSignal(c.name, c.name, c.website);
    const result = matchFundingEventToRepo(signal, candidates);
    if (result && result.confidence >= CONFIDENCE_FLOOR) {
      syntheticHits++;
      console.log(
        `  ${c.name.padEnd(18)} → ${result.repoFullName} (${result.reason}, ${result.confidence.toFixed(2)})`,
      );
    } else {
      missed.push(c.name);
      console.log(`  ${c.name.padEnd(18)} → no-match`);
    }
  }
  console.log(
    `\n  synthetic hits: ${syntheticHits}/${panel.length} (${missed.length === 0 ? "all brands wired" : `missed: ${missed.join(", ")}`})`,
  );
}

main();
