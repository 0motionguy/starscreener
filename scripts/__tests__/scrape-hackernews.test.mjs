import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  normalizeFullName,
  extractRepoMentions,
  computeVelocityFields,
  computeTrendingScore,
  stripStoryText,
  normalizeFirebaseItem,
  normalizeAlgoliaHit,
} from "../scrape-hackernews.mjs";
import { classifyPost } from "../classify-post.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("importing scrape-hackernews as a module does not run the scraper", () => {
  const res = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "import './scripts/scrape-hackernews.mjs'; console.log('imported');",
    ],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: 3000,
    },
  );
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /imported/);
});

// ---------------------------------------------------------------------------
// normalizeFullName + extractRepoMentions
// ---------------------------------------------------------------------------

test("normalizeFullName: lowercases and strips .git + trailing punctuation", () => {
  assert.equal(normalizeFullName("OpenAI", "Gym"), "openai/gym");
  assert.equal(normalizeFullName("foo", "bar.git"), "foo/bar");
  assert.equal(normalizeFullName("foo", "bar.git."), "foo/bar");
  assert.equal(normalizeFullName("a", "b,"), "a/b");
  assert.equal(normalizeFullName("a", "b)."), "a/b");
});

test("extractRepoMentions: finds github.com links in any blob", () => {
  const text = "check out https://github.com/anthropics/claude-code and github.com/openai/gym";
  const tracked = new Map([
    ["anthropics/claude-code", "anthropics/claude-code"],
    ["openai/gym", "openai/gym"],
  ]);
  const lowerSet = new Set(tracked.keys());
  const hits = extractRepoMentions(text, lowerSet);
  assert.ok(hits.has("anthropics/claude-code"));
  assert.ok(hits.has("openai/gym"));
  assert.equal(hits.size, 2);
});

test("extractRepoMentions: excludes reserved owners (orgs, settings, etc)", () => {
  const text = "https://github.com/orgs/foo and https://github.com/settings/profile";
  const hits = extractRepoMentions(text, null);
  assert.equal(hits.size, 0);
});

test("extractRepoMentions: filters to tracked set when provided", () => {
  const text = "github.com/foo/bar and github.com/baz/qux";
  const tracked = new Set(["foo/bar"]);
  const hits = extractRepoMentions(text, tracked);
  assert.ok(hits.has("foo/bar"));
  assert.ok(!hits.has("baz/qux"));
});

test("extractRepoMentions: returns all hits when tracked set is null", () => {
  const text = "github.com/foo/bar github.com/baz/qux";
  const hits = extractRepoMentions(text, null);
  assert.equal(hits.size, 2);
});

// ---------------------------------------------------------------------------
// Velocity + trending score
// ---------------------------------------------------------------------------

test("computeVelocityFields: age floor prevents divide-by-zero", () => {
  // Story posted "right now" — age should floor at 0.5h.
  const now = 1_700_000_000;
  const v = computeVelocityFields(100, now, now);
  assert.equal(v.ageHours, 0.5);
  assert.equal(v.velocity, 200); // 100/0.5
});

test("computeVelocityFields: decays with age", () => {
  const now = 1_700_000_000;
  const posted10hAgo = now - 10 * 3600;
  const v = computeVelocityFields(100, posted10hAgo, now);
  assert.equal(v.ageHours, 10);
  assert.equal(v.velocity, 10); // 100/10
});

test("computeTrendingScore: comments boost the signal", () => {
  const now = 1_700_000_000;
  const posted1hAgo = now - 3600;
  const noComments = computeTrendingScore(100, posted1hAgo, 0, now);
  const manyComments = computeTrendingScore(100, posted1hAgo, 300, now);
  // With 300 comments: boost = 1 + 300/10 = 31x, dramatically higher.
  assert.ok(manyComments > noComments * 10);
});

test("computeTrendingScore: zero score collapses cleanly", () => {
  const now = 1_700_000_000;
  const posted1hAgo = now - 3600;
  // log10(max(1, 0)) = 0 → entire trendingScore = 0.
  assert.equal(computeTrendingScore(0, posted1hAgo, 0, now), 0);
  assert.equal(computeTrendingScore(0, posted1hAgo, 300, now), 0);
});

// ---------------------------------------------------------------------------
// HN classifier additions
// ---------------------------------------------------------------------------

test("classifyPost HN: Show HN gets high value_score", () => {
  const result = classifyPost({
    title: "Show HN: Foo — a thing that does X",
    selftext: "",
    url: "https://github.com/foo/bar",
    platform: "hn",
  });
  assert.ok(result.content_tags.includes("is-show-hn"));
  assert.ok(result.content_tags.includes("has-github-repo"));
  // Show HN (+2) + has-github-repo (+1) = 3
  assert.equal(result.value_score, 3);
});

test("classifyPost HN: Ask HN tagged", () => {
  const result = classifyPost({
    title: "Ask HN: What stack are you using in 2026?",
    selftext: "curious what's working for people",
    url: "",
    platform: "hn",
  });
  assert.ok(result.content_tags.includes("is-ask-hn"));
  // +2 for Ask HN. is-question rule might fire too on "What stack" but
  // it's not a value tag so doesn't change score.
  assert.ok(result.value_score >= 2);
});

test("classifyPost HN: Launch HN tagged", () => {
  const result = classifyPost({
    title: "Launch HN: Acme (YC X26) — AI agents for dentists",
    selftext: "Hello HN, we're Acme.",
    url: "",
    platform: "hn",
  });
  assert.ok(result.content_tags.includes("is-launch-hn"));
  assert.ok(result.value_score >= 2);
});

test("classifyPost Reddit: HN tags stay OFF without platform flag", () => {
  const result = classifyPost({
    title: "Show HN: reddit crosspost of an HN launch",
    selftext: "this is a reddit post",
    url: "",
  });
  assert.ok(!result.content_tags.includes("is-show-hn"));
  assert.ok(!result.content_tags.includes("is-ask-hn"));
  assert.ok(!result.content_tags.includes("is-launch-hn"));
});

test("classifyPost HN: non-prefixed title does not get HN tags", () => {
  const result = classifyPost({
    title: "My new AI agent framework — open source",
    selftext: "",
    url: "",
    platform: "hn",
  });
  assert.ok(!result.content_tags.includes("is-show-hn"));
  assert.ok(!result.content_tags.includes("is-ask-hn"));
  assert.ok(!result.content_tags.includes("is-launch-hn"));
});

// ---------------------------------------------------------------------------
// stripStoryText
// ---------------------------------------------------------------------------

test("stripStoryText: removes HTML tags and decodes entities", () => {
  // Real HN format: URLs appear duplicated as both href and link text.
  const html =
    "<p>Check out <a href=\"https://github.com/foo/bar\" rel=\"nofollow\">https://github.com/foo/bar</a> &mdash; it&#x27;s great</p>";
  const cleaned = stripStoryText(html);
  assert.ok(!cleaned.includes("<"));
  assert.ok(!cleaned.includes(">"));
  assert.ok(cleaned.includes("github.com/foo/bar"));
  assert.ok(cleaned.includes("it's"));
});

test("stripStoryText: handles empty/null input", () => {
  assert.equal(stripStoryText(""), "");
  assert.equal(stripStoryText(null), "");
  assert.equal(stripStoryText(undefined), "");
});

// ---------------------------------------------------------------------------
// normalizeFirebaseItem
// ---------------------------------------------------------------------------

test("normalizeFirebaseItem: rejects non-story types", () => {
  const nowSec = 1_700_000_000;
  const job = { id: 1, type: "job", title: "hire", time: nowSec - 3600, score: 50 };
  assert.equal(normalizeFirebaseItem(job, new Map(), nowSec), null);
});

test("normalizeFirebaseItem: rejects dead/deleted stories", () => {
  const nowSec = 1_700_000_000;
  const dead = { id: 1, type: "story", title: "x", time: nowSec, score: 10, dead: true };
  const deleted = { id: 2, type: "story", title: "x", time: nowSec, score: 10, deleted: true };
  assert.equal(normalizeFirebaseItem(dead, new Map(), nowSec), null);
  assert.equal(normalizeFirebaseItem(deleted, new Map(), nowSec), null);
});

test("normalizeFirebaseItem: happy path — Show HN with repo", () => {
  const nowSec = 1_700_000_000;
  const tracked = new Map([["foo/bar", "Foo/Bar"]]);
  const item = {
    id: 42,
    type: "story",
    title: "Show HN: I built Foo",
    url: "https://github.com/foo/bar",
    by: "alice",
    score: 200,
    descendants: 50,
    time: nowSec - 2 * 3600, // 2h old
    text: "",
  };
  const n = normalizeFirebaseItem(item, tracked, nowSec);
  assert.equal(n.id, 42);
  assert.equal(n.by, "alice");
  assert.equal(n.score, 200);
  assert.equal(n.descendants, 50);
  assert.equal(n.ageHours, 2);
  assert.equal(n.velocity, 100); // 200/2
  assert.ok(n.content_tags.includes("is-show-hn"));
  assert.ok(n.content_tags.includes("has-github-repo"));
  assert.equal(n.linkedRepos.length, 1);
  assert.equal(n.linkedRepos[0].fullName, "Foo/Bar"); // canonical casing preserved
  assert.equal(n.everHitFrontPage, false); // set by merge stage, not here
});

test("normalizeFirebaseItem: story with no URL/text has empty linkedRepos", () => {
  const nowSec = 1_700_000_000;
  const item = {
    id: 99,
    type: "story",
    title: "Pure link story",
    url: "https://example.com/article",
    by: "bob",
    score: 10,
    descendants: 0,
    time: nowSec - 3600,
  };
  const n = normalizeFirebaseItem(item, new Map(), nowSec);
  assert.equal(n.linkedRepos.length, 0);
});

// ---------------------------------------------------------------------------
// normalizeAlgoliaHit
// ---------------------------------------------------------------------------

test("normalizeAlgoliaHit: maps Algolia field names correctly", () => {
  const nowSec = 1_700_000_000;
  const tracked = new Map([["anthropics/claude-code", "anthropics/claude-code"]]);
  const hit = {
    objectID: "12345",
    title: "anthropics/claude-code is impressive",
    url: "https://github.com/anthropics/claude-code",
    author: "carol",
    points: 150,
    num_comments: 40,
    created_at_i: nowSec - 3600,
    story_text: null,
  };
  const n = normalizeAlgoliaHit(hit, tracked, nowSec);
  assert.equal(n.id, 12345);
  assert.equal(n.by, "carol");
  assert.equal(n.score, 150);
  assert.equal(n.descendants, 40);
  assert.equal(n.linkedRepos.length, 1);
  assert.equal(n.linkedRepos[0].fullName, "anthropics/claude-code");
});

test("normalizeAlgoliaHit: handles null story_text", () => {
  const nowSec = 1_700_000_000;
  const hit = {
    objectID: "1",
    title: "t",
    url: "https://example.com",
    author: "x",
    points: 1,
    num_comments: 0,
    created_at_i: nowSec,
    story_text: null,
  };
  const n = normalizeAlgoliaHit(hit, new Map(), nowSec);
  assert.equal(n.storyText, "");
});

test("normalizeAlgoliaHit: bad objectID rejected", () => {
  const nowSec = 1_700_000_000;
  const hit = { objectID: "not-a-number", created_at_i: nowSec };
  assert.equal(normalizeAlgoliaHit(hit, new Map(), nowSec), null);
});
