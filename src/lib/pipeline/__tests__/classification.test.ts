// StarScreener Pipeline — Classification tests
//
// Uses the built-in node:test runner. Run with:
//   node --import tsx --test src/lib/pipeline/__tests__/classification.test.ts
//
// If tsx is not installed, these tests still function as plain assertions —
// the harness is node:test which ships with Node 20+.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import type { Repo } from "../../types";
import {
  classifyRepo,
  classifyBatch,
  classifyByTopics,
} from "../classification/classifier";
import {
  interpretConfidence,
  explainClassification,
} from "../classification/confidence";

// ---------------------------------------------------------------------------
// Test fixture helper
// ---------------------------------------------------------------------------

function makeRepo(partial: Partial<Repo> & { fullName: string }): Repo {
  const [owner, name] = partial.fullName.split("/");
  return {
    id: partial.id ?? `${owner}--${name}`,
    fullName: partial.fullName,
    name: partial.name ?? name ?? "",
    owner: partial.owner ?? owner ?? "",
    ownerAvatarUrl: partial.ownerAvatarUrl ?? "",
    description: partial.description ?? "",
    url: partial.url ?? `https://github.com/${partial.fullName}`,
    language: partial.language ?? null,
    topics: partial.topics ?? [],
    categoryId: partial.categoryId ?? "devtools",
    stars: partial.stars ?? 0,
    forks: partial.forks ?? 0,
    contributors: partial.contributors ?? 0,
    openIssues: partial.openIssues ?? 0,
    lastCommitAt: partial.lastCommitAt ?? new Date().toISOString(),
    lastReleaseAt: partial.lastReleaseAt ?? null,
    lastReleaseTag: partial.lastReleaseTag ?? null,
    createdAt: partial.createdAt ?? new Date().toISOString(),
    starsDelta24h: partial.starsDelta24h ?? 0,
    starsDelta7d: partial.starsDelta7d ?? 0,
    starsDelta30d: partial.starsDelta30d ?? 0,
    forksDelta7d: partial.forksDelta7d ?? 0,
    contributorsDelta30d: partial.contributorsDelta30d ?? 0,
    momentumScore: partial.momentumScore ?? 0,
    movementStatus: partial.movementStatus ?? "stable",
    rank: partial.rank ?? 0,
    categoryRank: partial.categoryRank ?? 0,
    sparklineData: partial.sparklineData ?? [],
    socialBuzzScore: partial.socialBuzzScore ?? 0,
    mentionCount24h: partial.mentionCount24h ?? 0,
  };
}

// ---------------------------------------------------------------------------
// classifyRepo — category identification
// ---------------------------------------------------------------------------

test("classifyRepo identifies langchain-ai/langchain as ai-agents", () => {
  const repo = makeRepo({
    fullName: "langchain-ai/langchain",
    description: "Build LLM agent applications with composable tools",
    topics: ["ai-agent", "llm", "agents"],
  });
  const result = classifyRepo(repo);
  assert.equal(result.primary.categoryId, "ai-agents");
  assert.ok(result.primary.confidence > 0);
});

test("classifyRepo identifies ollama/ollama as local-llm", () => {
  const repo = makeRepo({
    fullName: "ollama/ollama",
    description: "Run local LLMs on your machine",
    topics: ["ollama", "llama", "local-llm"],
  });
  const result = classifyRepo(repo);
  assert.equal(result.primary.categoryId, "local-llm");
  assert.ok(result.primary.confidence > 0);
});

test("classifyRepo identifies modelcontextprotocol/servers as mcp", () => {
  const repo = makeRepo({
    fullName: "modelcontextprotocol/servers",
    description: "Reference MCP server implementations",
    topics: ["mcp", "model-context-protocol"],
  });
  const result = classifyRepo(repo);
  assert.equal(result.primary.categoryId, "mcp");
  assert.ok(result.primary.confidence > 0);
});

test("classifyRepo identifies astral-sh/ruff as devtools", () => {
  const repo = makeRepo({
    fullName: "astral-sh/ruff",
    description: "An extremely fast Python linter and formatter",
    topics: ["linter", "formatter", "cli"],
  });
  const result = classifyRepo(repo);
  assert.equal(result.primary.categoryId, "devtools");
  assert.ok(result.primary.confidence > 0);
});

test("classifyRepo identifies vercel/next.js as web-frameworks", () => {
  const repo = makeRepo({
    fullName: "vercel/next.js",
    name: "next.js",
    description: "The React framework for the web",
    topics: ["react", "ssr", "web-framework"],
  });
  const result = classifyRepo(repo);
  assert.equal(result.primary.categoryId, "web-frameworks");
  assert.ok(result.primary.confidence > 0);
});

// ---------------------------------------------------------------------------
// Fallback + invariants
// ---------------------------------------------------------------------------

test("classifyRepo returns devtools fallback for repos with no signals", () => {
  const repo = makeRepo({
    fullName: "someone/unclassifiable",
    description: "A thing that does a thing",
    topics: [],
  });
  const result = classifyRepo(repo);
  assert.equal(result.primary.categoryId, "devtools");
  assert.equal(result.primary.confidence, 0);
  assert.deepEqual(result.primary.matched, {
    topics: [],
    keywords: [],
    ownerPrefix: null,
  });
  assert.deepEqual(result.secondary, []);
});

test("classifyRepo produces confidence in [0, 1]", () => {
  const repo = makeRepo({
    fullName: "modelcontextprotocol/servers",
    description: "MCP server MCP client model context protocol",
    topics: ["mcp", "model-context-protocol"],
  });
  const result = classifyRepo(repo);
  assert.ok(result.primary.confidence >= 0);
  assert.ok(result.primary.confidence <= 1);
  for (const s of result.secondary) {
    assert.ok(s.confidence >= 0);
    assert.ok(s.confidence <= 1);
  }
});

test("classifyBatch preserves order and matches individual calls", () => {
  const repos = [
    makeRepo({ fullName: "ollama/ollama", topics: ["ollama"] }),
    makeRepo({ fullName: "vercel/next.js", topics: ["react"] }),
  ];
  const batch = classifyBatch(repos);
  assert.equal(batch.length, 2);
  assert.equal(batch[0].primary.categoryId, "local-llm");
  assert.equal(batch[1].primary.categoryId, "web-frameworks");
});

// ---------------------------------------------------------------------------
// classifyByTopics
// ---------------------------------------------------------------------------

test("classifyByTopics(['mcp']) returns mcp as first element", () => {
  const result = classifyByTopics(["mcp"]);
  assert.ok(result.length >= 1);
  assert.equal(result[0], "mcp");
});

test("classifyByTopics returns empty array when no topics match", () => {
  const result = classifyByTopics(["completely-unknown-topic-xyz"]);
  assert.deepEqual(result, []);
});

// ---------------------------------------------------------------------------
// Confidence helpers
// ---------------------------------------------------------------------------

test("interpretConfidence buckets scores correctly", () => {
  assert.equal(interpretConfidence(0.8), "high");
  assert.equal(interpretConfidence(0.6), "high");
  assert.equal(interpretConfidence(0.45), "medium");
  assert.equal(interpretConfidence(0.3), "medium");
  assert.equal(interpretConfidence(0.1), "low");
  assert.equal(interpretConfidence(0), "low");
});

test("explainClassification produces readable strings", () => {
  const explanation = explainClassification({
    categoryId: "ai-agents",
    confidence: 0.8,
    matched: {
      topics: ["ai-agent"],
      keywords: [],
      ownerPrefix: "langchain-ai",
    },
  });
  assert.ok(explanation.includes("ai-agent"));
  assert.ok(explanation.includes("langchain-ai"));
  assert.ok(explanation.includes("high confidence"));
});

test("explainClassification handles empty matches", () => {
  const explanation = explainClassification({
    categoryId: "devtools",
    confidence: 0,
    matched: { topics: [], keywords: [], ownerPrefix: null },
  });
  assert.ok(explanation.includes("low confidence"));
});

// ---------------------------------------------------------------------------
// P0.4 regression tests — gate 4 misses (2026-04-18)
// ---------------------------------------------------------------------------
//
// Gate 4 against fresh production data surfaced three canonical AI repos
// that classified wrong. These tests lock the fix in place:
//
//   cline/cline       → classified as devtools fallback (no rule scored > 0)
//   letta-ai/letta    → classified as ai-ml (should be ai-agents)
//   huggingface/smolagents → classified as ai-ml (should be ai-agents)
//
// Root cause: the keyword matcher used substring, so "autonomous coding
// agent" in cline's description didn't match "autonomous agent" (two
// words vs three with "coding" in between). No owner prefix covered the
// modern coding-agent cohort (cline, continuedev, Aider-AI, Pythagora-io,
// All-Hands-AI, sst/opencode, Doriandarko, plandex-ai, semanser, etc.).

test("P0.4 cline/cline classifies as ai-agents (was devtools fallback)", () => {
  const repo = makeRepo({
    fullName: "cline/cline",
    description:
      "Autonomous coding agent right in your IDE, capable of creating/editing files, executing commands, using the browser, and more with your permission every step of the way.",
    topics: [],
  });
  const result = classifyRepo(repo);
  assert.equal(result.primary.categoryId, "ai-agents");
  assert.ok(
    result.primary.confidence > 0,
    `expected confidence > 0, got ${result.primary.confidence}`,
  );
});

test("P0.4 continuedev/continue classifies as ai-agents", () => {
  const repo = makeRepo({
    fullName: "continuedev/continue",
    description:
      "The leading open-source AI code assistant. You can connect any models and any context to create custom autocomplete and chat experiences inside the IDE",
    topics: [],
  });
  const result = classifyRepo(repo);
  assert.equal(result.primary.categoryId, "ai-agents");
});

test("P0.4 Aider-AI/aider classifies as ai-agents", () => {
  const repo = makeRepo({
    fullName: "Aider-AI/aider",
    description: "aider is AI pair programming in your terminal",
    topics: [],
  });
  const result = classifyRepo(repo);
  assert.equal(result.primary.categoryId, "ai-agents");
});

test("P0.4 letta-ai/letta classifies as ai-agents (was ai-ml)", () => {
  const repo = makeRepo({
    fullName: "letta-ai/letta",
    description:
      "Letta (formerly MemGPT) is a framework for creating stateful LLM agents with long-term memory",
    topics: ["llm", "ai"],
  });
  const result = classifyRepo(repo);
  assert.equal(result.primary.categoryId, "ai-agents");
});

test("P0.4 huggingface/smolagents classifies as ai-agents (was ai-ml)", () => {
  const repo = makeRepo({
    fullName: "huggingface/smolagents",
    description:
      "smolagents: a barebones library for agents that think in code.",
    topics: [],
  });
  const result = classifyRepo(repo);
  // smolagents is an ai-agents primary because "agents" is literally in
  // its name and description. Even though huggingface is an ai-ml owner,
  // the ai-agents signal should dominate.
  assert.equal(result.primary.categoryId, "ai-agents");
});

test("P0.4 All-Hands-AI/OpenHands classifies as ai-agents", () => {
  const repo = makeRepo({
    fullName: "All-Hands-AI/OpenHands",
    description:
      "🙌 OpenHands: Code Less, Make More — an autonomous AI software engineer",
    topics: [],
  });
  const result = classifyRepo(repo);
  assert.equal(result.primary.categoryId, "ai-agents");
});

test("P0.4 keyword matcher catches 'coding agent' in descriptions", () => {
  // The original bug: substring "autonomous agent" didn't match
  // "autonomous coding agent" because of the word between. The fix
  // adds "coding agent" as a standalone keyword that catches the entire
  // modern coding-agent cohort.
  const repo = makeRepo({
    fullName: "unknown-owner/mystery-tool",
    description: "A brand-new coding agent that writes code for you.",
    topics: [],
  });
  const result = classifyRepo(repo);
  assert.equal(result.primary.categoryId, "ai-agents");
});
