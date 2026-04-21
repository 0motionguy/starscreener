import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePost, isAiAdjacent } from "../scrape-producthunt.mjs";
import {
  extractGithubLink,
  hasAiKeyword,
  daysBetween,
} from "../_ph-shared.mjs";

// ---------------------------------------------------------------------------
// extractGithubLink
// ---------------------------------------------------------------------------

test("extractGithubLink: finds a github URL in a text blob", () => {
  const hit = extractGithubLink(
    "Check the repo: https://github.com/openai/gym, it's great",
  );
  assert.ok(hit);
  assert.equal(hit.fullName, "openai/gym");
  assert.equal(hit.url, "https://github.com/openai/gym");
});

test("extractGithubLink: strips trailing .git and punctuation", () => {
  const hit = extractGithubLink("clone https://github.com/foo/bar.git.");
  assert.ok(hit);
  assert.equal(hit.fullName, "foo/bar");
});

test("extractGithubLink: rejects reserved owners (orgs/settings/trending)", () => {
  assert.equal(extractGithubLink("https://github.com/orgs/foo"), null);
  assert.equal(extractGithubLink("https://github.com/settings/profile"), null);
  assert.equal(extractGithubLink("https://github.com/trending/rust"), null);
});

test("extractGithubLink: returns null when no URL present", () => {
  assert.equal(extractGithubLink("just a product website"), null);
  assert.equal(extractGithubLink(""), null);
  assert.equal(extractGithubLink(null), null);
});

// ---------------------------------------------------------------------------
// hasAiKeyword
// ---------------------------------------------------------------------------

test("hasAiKeyword: matches LLM/agent/MCP/Claude skill/RAG jargon", () => {
  assert.ok(hasAiKeyword("Built an LLM-powered tool"));
  assert.ok(hasAiKeyword("AI agent for customer support"));
  assert.ok(hasAiKeyword("MCP server for Claude Desktop"));
  assert.ok(hasAiKeyword("Claude skill for deep research"));
  assert.ok(hasAiKeyword("RAG pipeline for legal docs"));
  assert.ok(hasAiKeyword("Generative AI-powered product"));
  assert.ok(hasAiKeyword("Anthropic-built prompt library"));
});

test("hasAiKeyword: ignores unrelated product text", () => {
  assert.ok(!hasAiKeyword("Fancy spreadsheet alternative"));
  assert.ok(!hasAiKeyword("Photo editor with filters"));
  assert.ok(!hasAiKeyword("Social marketing scheduler"));
  assert.ok(!hasAiKeyword(""));
  assert.ok(!hasAiKeyword(null));
});

// ---------------------------------------------------------------------------
// daysBetween
// ---------------------------------------------------------------------------

test("daysBetween: absolute non-negative day count", () => {
  const a = "2026-04-20T00:00:00Z";
  const b = "2026-04-22T12:00:00Z";
  assert.equal(daysBetween(a, b), 2);
});

test("daysBetween: clamps negative differences to 0", () => {
  // Future-dated post (shouldn't happen but defend anyway).
  const a = "2027-01-01T00:00:00Z";
  const b = "2026-01-01T00:00:00Z";
  assert.equal(daysBetween(a, b), 0);
});

// ---------------------------------------------------------------------------
// normalizePost
// ---------------------------------------------------------------------------

test("normalizePost: shapes a valid PH post node", () => {
  const tracked = new Map([["openai/gym", "openai/gym"]]);
  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const node = {
    id: "1234",
    name: "LLMKit",
    tagline: "LLM dev stack",
    description: "Open source at https://github.com/openai/gym — try it",
    url: "https://www.producthunt.com/posts/llmkit",
    votesCount: 230,
    commentsCount: 12,
    createdAt: twoDaysAgo,
    website: "https://llmkit.example.com",
    thumbnail: { url: "https://example.com/thumb.png" },
    topics: {
      edges: [
        { node: { slug: "developer-tools", name: "Developer Tools" } },
        { node: { slug: "artificial-intelligence", name: "AI" } },
      ],
    },
    makers: [{ name: "Alice", username: "alice" }],
  };
  const launch = normalizePost(node, tracked);
  assert.equal(launch.id, "1234");
  assert.equal(launch.name, "LLMKit");
  assert.equal(launch.votesCount, 230);
  assert.equal(launch.linkedRepo, "openai/gym");
  assert.equal(launch.githubUrl, "https://github.com/openai/gym");
  assert.deepEqual(launch.topics, ["developer-tools", "artificial-intelligence"]);
  assert.equal(launch.makers[0].username, "alice");
  assert.equal(launch.daysSinceLaunch, 2);
  assert.equal(launch.thumbnail, "https://example.com/thumb.png");
});

test("normalizePost: returns null for malformed or incomplete nodes", () => {
  assert.equal(normalizePost(null, new Map()), null);
  assert.equal(normalizePost({ id: "x" }, new Map()), null);
  assert.equal(
    normalizePost({ createdAt: new Date().toISOString() }, new Map()),
    null,
  );
});

test("normalizePost: linkedRepo null when GH URL not in tracked set", () => {
  const node = {
    id: "5",
    name: "Untracked",
    tagline: "",
    createdAt: new Date().toISOString(),
    description: "source: https://github.com/unknown/repo",
  };
  const launch = normalizePost(node, new Map());
  assert.equal(launch.githubUrl, "https://github.com/unknown/repo");
  assert.equal(launch.linkedRepo, null);
});

test("normalizePost: empty website+description yields null githubUrl", () => {
  const node = {
    id: "7",
    name: "X",
    tagline: "Y",
    description: "",
    website: null,
    createdAt: new Date().toISOString(),
  };
  const launch = normalizePost(node, new Map());
  assert.equal(launch.githubUrl, null);
  assert.equal(launch.linkedRepo, null);
});

// ---------------------------------------------------------------------------
// isAiAdjacent
// ---------------------------------------------------------------------------

test("isAiAdjacent: 'artificial-intelligence' topic qualifies outright", () => {
  assert.ok(
    isAiAdjacent({
      name: "BoringName",
      tagline: "",
      description: "",
      topics: ["artificial-intelligence"],
      makers: [],
    }),
  );
});

test("isAiAdjacent: MCP in tagline qualifies even with non-AI topic", () => {
  assert.ok(
    isAiAdjacent({
      name: "Desktop Buddy",
      tagline: "MCP server for your dock",
      description: "",
      topics: ["productivity"],
      makers: [],
    }),
  );
});

test("isAiAdjacent: Claude skill in name qualifies", () => {
  assert.ok(
    isAiAdjacent({
      name: "DeepResearch Claude Skill",
      tagline: "Multi-step web research",
      description: "",
      topics: ["saas"],
      makers: [],
    }),
  );
});

test("isAiAdjacent: unrelated product rejected", () => {
  assert.ok(
    !isAiAdjacent({
      name: "Spreadsheet Pro",
      tagline: "Better sheets",
      description: "Fast formula engine",
      topics: ["saas"],
      makers: [],
    }),
  );
});
