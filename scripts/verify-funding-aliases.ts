// One-off probe: measure the real-world match-count delta from enabling the
// funding-alias registry. Runs the matcher against every signal in
// data/funding-news.json twice — once with an empty registry, once with the
// seeded registry — and reports the delta broken down by match reason.
//
// Run:
//   npx tsx scripts/verify-funding-aliases.ts

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getFundingAliasRegistry } from "../src/lib/funding/aliases";
import {
  matchFundingEventToRepo,
  type FundingMatchReason,
  type RepoCandidate,
} from "../src/lib/funding/match";
import type { FundingNewsFile } from "../src/lib/funding/types";
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

function buildCandidatesWithoutRegistry(
  metas: RepoMetadata[],
): RepoCandidate[] {
  return metas.map((meta) => ({
    fullName: meta.fullName,
    homepage: meta.homepageUrl ?? null,
    aliases: [],
    ownerDomain: null,
  }));
}

function buildCandidatesWithRegistry(metas: RepoMetadata[]): RepoCandidate[] {
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
  signals: FundingNewsFile["signals"],
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

function main(): void {
  const metas = loadRepoMetadata();
  const file = loadFundingNews();
  const signals = file.signals ?? [];

  const registry = getFundingAliasRegistry();
  const metaLower = new Set(metas.map((m) => m.fullName.toLowerCase()));
  const inMeta = [...registry.keys()].filter((k) => metaLower.has(k)).length;

  console.log(
    `[verify-funding-aliases] signals=${signals.length} repos=${metas.length} ` +
      `registry=${registry.size} (${inMeta} present in repo-metadata.json)`,
  );

  const before = runMatcher(signals, buildCandidatesWithoutRegistry(metas));
  const after = runMatcher(signals, buildCandidatesWithRegistry(metas));

  console.log(`\nBefore registry:`);
  console.log(`  total: ${before.total}`);
  for (const k of Object.keys(before.byReason) as FundingMatchReason[]) {
    console.log(`  ${k}: ${before.byReason[k]}`);
  }

  console.log(`\nAfter registry:`);
  console.log(`  total: ${after.total}`);
  for (const k of Object.keys(after.byReason) as FundingMatchReason[]) {
    console.log(`  ${k}: ${after.byReason[k]}`);
  }

  const deltaTotal = after.total - before.total;
  const deltaDomain = after.byReason.domain - before.byReason.domain;
  const deltaAlias = after.byReason.alias - before.byReason.alias;

  console.log(
    `\nBefore: ${before.total} matches, After: ${after.total} matches ` +
      `(+${deltaDomain} domain matches, +${deltaAlias} alias matches, ` +
      `delta=${deltaTotal >= 0 ? "+" : ""}${deltaTotal})`,
  );

  // Synthetic backstop: prove the registry fires end-to-end against the
  // brands we seeded, using the same candidate list + matcher. This is the
  // upper-bound lift we'd see once the funding-news scraper surfaces these
  // orgs AND the repo-metadata snapshot includes the seeded repos.
  console.log(`\nSynthetic backstop (hypothetical funding-news signals):`);
  const candidatesWithRegistry = buildCandidatesWithRegistry(metas);
  const syntheticCases: Array<{ companyName: string; website: string | null }> =
    [
      { companyName: "Hugging Face", website: "https://huggingface.co" },
      { companyName: "HuggingFace", website: null },
      { companyName: "OpenAI", website: null },
      { companyName: "Anthropic", website: null },
      { companyName: "Vercel", website: "https://vercel.com" },
      { companyName: "Ollama", website: null },
      { companyName: "LangChain", website: null },
      { companyName: "Mistral AI", website: null },
      { companyName: "DeepSeek", website: null },
      { companyName: "Unsloth AI", website: null },
    ];
  let syntheticHits = 0;
  for (const c of syntheticCases) {
    const signal = {
      id: `synthetic-${c.companyName}`,
      headline: `${c.companyName} raises $100M`,
      description: "",
      sourceUrl: "",
      sourcePlatform: "techcrunch" as const,
      publishedAt: "2026-04-23T00:00:00Z",
      discoveredAt: "2026-04-23T00:00:00Z",
      extracted: {
        companyName: c.companyName,
        companyWebsite: c.website,
        companyLogoUrl: null,
        amount: 100_000_000,
        amountDisplay: "$100M",
        currency: "USD",
        roundType: "series-d-plus" as const,
        investors: [],
        investorsEnriched: [],
        confidence: "high" as const,
      },
      tags: [],
    };
    const result = matchFundingEventToRepo(signal, candidatesWithRegistry);
    if (result && result.confidence >= CONFIDENCE_FLOOR) {
      syntheticHits++;
      console.log(
        `  ${c.companyName} → ${result.repoFullName} (${result.reason}, ${result.confidence})`,
      );
    } else {
      console.log(`  ${c.companyName} → no-match`);
    }
  }
  console.log(
    `  synthetic hits: ${syntheticHits}/${syntheticCases.length}`,
  );
}

main();
