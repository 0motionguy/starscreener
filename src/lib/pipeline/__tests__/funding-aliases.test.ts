// Tests for the funding-alias registry + its effect on the matcher.
//
// Exercises:
//   1. Loader parses a fixture, drops malformed entries, warns on each.
//   2. Alias exact-match produces confidence 0.9 via matchFundingEventToRepo.
//   3. Domain match sourced from the registry produces confidence 1.0.
//   4. No registry entry → matcher falls back to the existing name-exact
//      and fuzzy bands (behavior unchanged for repos outside the registry).
//
// Run with: npx tsx --test src/lib/pipeline/__tests__/funding-aliases.test.ts

import { strict as assert } from "node:assert";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  __resetFundingAliasCacheForTests,
  __setFundingAliasPathForTests,
  getFundingAliasRegistry,
} from "../../funding/aliases";
import {
  matchFundingEventToRepo,
  type RepoCandidate,
} from "../../funding/match";
import type { FundingSignal } from "../../funding/types";

const FIXTURE_PATH = resolve(
  __dirname,
  "fixtures",
  "funding-aliases-test.json",
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSignal(
  companyName: string,
  companyWebsite: string | null = null,
): FundingSignal {
  return {
    id: `test-${companyName}`,
    headline: `${companyName} raises $100M Series Z`,
    description: "",
    sourceUrl: "https://example.com/x",
    sourcePlatform: "techcrunch",
    publishedAt: "2026-04-23T12:00:00.000Z",
    discoveredAt: "2026-04-23T12:00:00.000Z",
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

function buildCandidatesFromRegistry(
  baseRepos: Array<{ fullName: string; homepage?: string | null }>,
): RepoCandidate[] {
  const registry = getFundingAliasRegistry();
  return baseRepos.map((r) => {
    const entry = registry.get(r.fullName.toLowerCase());
    return {
      fullName: r.fullName,
      homepage: r.homepage ?? null,
      aliases: entry?.aliases ?? [],
      ownerDomain: entry?.domains[0] ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("registry loads from fixture JSON", () => {
  __setFundingAliasPathForTests(FIXTURE_PATH);
  try {
    const registry = getFundingAliasRegistry();
    const hf = registry.get("huggingface/transformers");
    assert.ok(hf, "expected hugging face entry");
    assert.deepEqual(hf.aliases, ["Hugging Face", "HuggingFace", "HF"]);
    assert.deepEqual(hf.domains, ["huggingface.co"]);

    const anthropic = registry.get("anthropics/claude-code");
    assert.ok(anthropic, "expected anthropic entry");
    assert.equal(anthropic.aliases[0], "Anthropic");
  } finally {
    __setFundingAliasPathForTests(null);
    __resetFundingAliasCacheForTests();
  }
});

test("invalid entries are dropped (not-array fields, missing repoFullName, bad fullName)", () => {
  __setFundingAliasPathForTests(FIXTURE_PATH);
  try {
    const registry = getFundingAliasRegistry();
    assert.equal(
      registry.size,
      2,
      `expected only the 2 valid entries, got ${registry.size}`,
    );
    assert.equal(registry.has("malformed/no-arrays"), false);
    assert.equal(registry.has("has-no-slash-sep"), false);
  } finally {
    __setFundingAliasPathForTests(null);
    __resetFundingAliasCacheForTests();
  }
});

test("alias match produces confidence 0.9", () => {
  __setFundingAliasPathForTests(FIXTURE_PATH);
  try {
    const candidates = buildCandidatesFromRegistry([
      { fullName: "huggingface/transformers", homepage: null },
      { fullName: "some/other-repo", homepage: null },
    ]);
    const signal = makeSignal("Hugging Face");
    const result = matchFundingEventToRepo(signal, candidates);
    assert.ok(result, "expected a match");
    assert.equal(result.repoFullName, "huggingface/transformers");
    assert.equal(result.reason, "alias");
    assert.equal(result.confidence, 0.9);
  } finally {
    __setFundingAliasPathForTests(null);
    __resetFundingAliasCacheForTests();
  }
});

test("alias match is normalized (case + punctuation insensitive)", () => {
  __setFundingAliasPathForTests(FIXTURE_PATH);
  try {
    const candidates = buildCandidatesFromRegistry([
      { fullName: "huggingface/transformers", homepage: null },
    ]);
    // "HuggingFace" in the registry; signal says "huggingface".
    const signal = makeSignal("huggingface");
    const result = matchFundingEventToRepo(signal, candidates);
    assert.ok(result);
    assert.equal(result.reason, "alias");
    assert.equal(result.confidence, 0.9);
  } finally {
    __setFundingAliasPathForTests(null);
    __resetFundingAliasCacheForTests();
  }
});

test("domain match from registry produces confidence 1.0", () => {
  __setFundingAliasPathForTests(FIXTURE_PATH);
  try {
    const candidates = buildCandidatesFromRegistry([
      // Repo with NO homepage, relying on the registry's ownerDomain.
      { fullName: "anthropics/claude-code", homepage: null },
      { fullName: "some/other-repo", homepage: null },
    ]);
    const signal = makeSignal(
      "Anthropic PBC — something totally different",
      "https://www.anthropic.com/news/series-e",
    );
    const result = matchFundingEventToRepo(signal, candidates);
    assert.ok(result, "expected a match");
    assert.equal(result.repoFullName, "anthropics/claude-code");
    assert.equal(result.reason, "domain");
    assert.equal(result.confidence, 1.0);
  } finally {
    __setFundingAliasPathForTests(null);
    __resetFundingAliasCacheForTests();
  }
});

test("repos without registry entry fall back to name-exact matcher", () => {
  __setFundingAliasPathForTests(FIXTURE_PATH);
  try {
    const candidates = buildCandidatesFromRegistry([
      { fullName: "acme/widget", homepage: null },
    ]);
    // "acme" matches owner portion of the fullName → company_name_exact.
    const signal = makeSignal("Acme");
    const result = matchFundingEventToRepo(signal, candidates);
    assert.ok(result);
    assert.equal(result.reason, "company_name_exact");
    assert.equal(result.confidence, 0.85);
  } finally {
    __setFundingAliasPathForTests(null);
    __resetFundingAliasCacheForTests();
  }
});

test("repos without registry entry fall back to fuzzy matcher", () => {
  __setFundingAliasPathForTests(FIXTURE_PATH);
  try {
    const candidates = buildCandidatesFromRegistry([
      { fullName: "acme/cloudsmith", homepage: null },
    ]);
    // "cloudsmitt" vs "cloudsmith" — one char off in a 10-char word →
    // normalized Levenshtein = 0.9, above the 0.88 threshold.
    const signal = makeSignal("Cloudsmitt");
    const result = matchFundingEventToRepo(signal, candidates);
    assert.ok(result, "expected a fuzzy match");
    assert.equal(result.reason, "company_name_fuzzy");
    assert.ok(result.confidence >= 0.6 && result.confidence <= 0.8);
  } finally {
    __setFundingAliasPathForTests(null);
    __resetFundingAliasCacheForTests();
  }
});

test("missing registry file → matcher keeps existing behavior", () => {
  __setFundingAliasPathForTests(
    resolve(__dirname, "fixtures", "does-not-exist.json"),
  );
  try {
    const registry = getFundingAliasRegistry();
    assert.equal(registry.size, 0);
    const candidates: RepoCandidate[] = [
      {
        fullName: "acme/widget",
        homepage: null,
        aliases: [],
        ownerDomain: null,
      },
    ];
    const signal = makeSignal("Acme");
    const result = matchFundingEventToRepo(signal, candidates);
    assert.ok(result);
    assert.equal(result.reason, "company_name_exact");
  } finally {
    __setFundingAliasPathForTests(null);
    __resetFundingAliasCacheForTests();
  }
});
