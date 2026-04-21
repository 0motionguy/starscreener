import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeFullName,
  extractRepoMentions,
  computeTrendingScore,
  classifyMentionLocation,
  normalizeArticle,
} from "../scrape-devto.mjs";

// ---------------------------------------------------------------------------
// normalizeFullName + extractRepoMentions
// ---------------------------------------------------------------------------

test("normalizeFullName: lowercases and strips .git + trailing punctuation", () => {
  assert.equal(normalizeFullName("Anthropics", "Claude-Code"), "anthropics/claude-code");
  assert.equal(normalizeFullName("foo", "bar.git"), "foo/bar");
  assert.equal(normalizeFullName("a", "b)."), "a/b");
});

test("normalizeFullName: strips .git AND trailing punctuation regardless of order", () => {
  // Regression for Sprint review finding #2 — ".git" followed by trailing
  // punctuation (".git." or ".git,") used to leave the .git intact.
  assert.equal(normalizeFullName("foo", "bar.git."), "foo/bar");
  assert.equal(normalizeFullName("foo", "bar.git,"), "foo/bar");
  assert.equal(normalizeFullName("foo", "bar.git)."), "foo/bar");
  assert.equal(normalizeFullName("foo", "bar.git;"), "foo/bar");
});

test("extractRepoMentions: finds github links in markdown body", () => {
  const body = `## Setup

Clone the repo:

\`\`\`
git clone https://github.com/anthropics/claude-code
\`\`\`

Also try [openai/gym](https://github.com/openai/gym).`;
  const tracked = new Set(["anthropics/claude-code", "openai/gym"]);
  const hits = extractRepoMentions(body, tracked);
  assert.ok(hits.has("anthropics/claude-code"));
  assert.ok(hits.has("openai/gym"));
});

test("extractRepoMentions: excludes reserved owners", () => {
  const text = "https://github.com/orgs/foo and https://github.com/settings/profile";
  const hits = extractRepoMentions(text, null);
  assert.equal(hits.size, 0);
});

test("extractRepoMentions: filters to tracked when provided", () => {
  const text = "github.com/foo/bar and github.com/baz/qux";
  const hits = extractRepoMentions(text, new Set(["foo/bar"]));
  assert.ok(hits.has("foo/bar"));
  assert.ok(!hits.has("baz/qux"));
});

// ---------------------------------------------------------------------------
// Trending score
// ---------------------------------------------------------------------------

test("computeTrendingScore: age floor prevents divide-by-zero", () => {
  const now = Date.now();
  const just = new Date(now).toISOString();
  // reactions=100, age=0.5h → velocity=200, log10(100)=2, no comments → 1.0×
  // → 200 × 2 × 1 = 400
  assert.equal(computeTrendingScore(100, 0, just, now), 400);
});

test("computeTrendingScore: comments boost the signal", () => {
  const now = Date.now();
  const oneHourAgo = new Date(now - 3600 * 1000).toISOString();
  const noComments = computeTrendingScore(100, 0, oneHourAgo, now);
  const tenComments = computeTrendingScore(100, 10, oneHourAgo, now);
  assert.ok(tenComments > noComments);
  assert.equal(tenComments, noComments * 2); // 1 + 10/10 = 2× boost
});

test("computeTrendingScore: returns 0 for invalid date", () => {
  assert.equal(computeTrendingScore(100, 5, "not-a-date"), 0);
});

// ---------------------------------------------------------------------------
// classifyMentionLocation
// ---------------------------------------------------------------------------

test("classifyMentionLocation: title beats description beats body", () => {
  const fullNameLower = "anthropics/claude-code";
  assert.equal(
    classifyMentionLocation({
      title: "I tried github.com/anthropics/claude-code today",
      description: "github.com/anthropics/claude-code review",
      tags: [],
      body: "github.com/anthropics/claude-code is great",
      fullNameLower,
    }),
    "title",
  );
  assert.equal(
    classifyMentionLocation({
      title: "An AI tool review",
      description: "Linking github.com/anthropics/claude-code",
      tags: [],
      body: "github.com/anthropics/claude-code",
      fullNameLower,
    }),
    "description",
  );
  assert.equal(
    classifyMentionLocation({
      title: "An AI tool review",
      description: "No link here",
      tags: [],
      body: "github.com/anthropics/claude-code",
      fullNameLower,
    }),
    "body",
  );
});

test("classifyMentionLocation: tag match when repo name is a tag", () => {
  assert.equal(
    classifyMentionLocation({
      title: "An AI piece",
      description: "no link",
      tags: ["ai", "ollama"],
      body: "",
      fullNameLower: "ollama/ollama",
    }),
    "tag",
  );
});

// ---------------------------------------------------------------------------
// normalizeArticle
// ---------------------------------------------------------------------------

test("normalizeArticle: extracts repo from body when description is empty", () => {
  const raw = {
    id: 12345,
    title: "Building an MCP server",
    description: "",
    url: "https://dev.to/foo/building-an-mcp-server",
    tag_list: ["ai", "mcp", "claude"],
    public_reactions_count: 142,
    comments_count: 18,
    reading_time_minutes: 8,
    published_at: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
    user: { username: "foo", name: "Foo Bar", profile_image_90: "https://x/y.png" },
  };
  const tracked = new Map([["anthropics/claude-code", "anthropics/claude-code"]]);
  const body = "Step 1 — install: see github.com/anthropics/claude-code";
  const n = normalizeArticle(raw, { tracked, body });
  assert.equal(n.id, 12345);
  assert.equal(n.linkedRepos.length, 1);
  assert.equal(n.linkedRepos[0].fullName, "anthropics/claude-code");
  assert.equal(n.linkedRepos[0].location, "body");
  assert.equal(n.author.username, "foo");
  assert.equal(n.reactionsCount, 142);
  assert.deepEqual(n.tags, ["ai", "mcp", "claude"]);
});

test("normalizeArticle: empty linkedRepos when body has no github URL", () => {
  const raw = {
    id: 99,
    title: "Pure essay on AI",
    description: "Thoughts.",
    url: "https://dev.to/x/y",
    tag_list: ["ai"],
    public_reactions_count: 5,
    comments_count: 0,
    reading_time_minutes: 3,
    published_at: new Date().toISOString(),
    user: { username: "x", name: "X" },
  };
  const n = normalizeArticle(raw, { tracked: new Map(), body: "no links here" });
  assert.equal(n.linkedRepos.length, 0);
});

test("normalizeArticle: returns null for malformed input", () => {
  assert.equal(normalizeArticle(null), null);
  assert.equal(normalizeArticle({ id: "not-a-number" }), null);
});
