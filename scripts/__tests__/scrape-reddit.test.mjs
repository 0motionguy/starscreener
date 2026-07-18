import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  applyMentionsLastGoodGuard,
  buildRepoAliasMatchers,
  extractRepoMentions,
  mergeAllPosts,
  normalizeFullName,
  scrubStaleProjectNameLinks,
} from "../scrape-reddit.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("importing scrape-reddit as a module does not run the scraper", () => {
  const res = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "import './scripts/scrape-reddit.mjs'; console.log('imported');",
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

test("normalizeFullName: lowercases and strips .git + trailing punctuation", () => {
  assert.equal(normalizeFullName("OpenAI", "Gym"), "openai/gym");
  assert.equal(normalizeFullName("foo", "bar.git"), "foo/bar");
  assert.equal(normalizeFullName("foo", "bar.git."), "foo/bar");
  assert.equal(normalizeFullName("a", "b,"), "a/b");
});

function buildFixtures() {
  const tracked = new Map([
    ["anthropics/claude-code", "anthropics/claude-code"],
    ["nousresearch/hermes", "NousResearch/hermes"],
    ["nousresearch/hermes-agent", "NousResearch/hermes-agent"],
    ["phuryn/claude-usage", "phuryn/claude-usage"],
    ["alirezarezvani/claude-skills", "alirezarezvani/claude-skills"],
    ["github/spec-kit", "github/spec-kit"],
    ["badlogic/pi-mono", "badlogic/pi-mono"],
    ["foo/agent-kit", "foo/agent-kit"],
    ["bar/agent-kit", "bar/agent-kit"],
  ]);
  const metadata = new Map([
    [
      "anthropics/claude-code",
      {
        fullName: "anthropics/claude-code",
        name: "claude-code",
        homepageUrl: "https://claude.ai/code",
      },
    ],
    [
      "nousresearch/hermes",
      {
        fullName: "NousResearch/hermes",
        name: "hermes",
        homepageUrl: "https://hermes.nousresearch.com",
      },
    ],
    [
      "nousresearch/hermes-agent",
      {
        fullName: "NousResearch/hermes-agent",
        name: "hermes-agent",
      },
    ],
    [
      "phuryn/claude-usage",
      {
        fullName: "phuryn/claude-usage",
        name: "claude-usage",
      },
    ],
    [
      "alirezarezvani/claude-skills",
      {
        fullName: "alirezarezvani/claude-skills",
        name: "claude-skills",
      },
    ],
    [
      "github/spec-kit",
      {
        fullName: "github/spec-kit",
        name: "spec-kit",
      },
    ],
    [
      "badlogic/pi-mono",
      {
        fullName: "badlogic/pi-mono",
        name: "pi-mono",
      },
    ],
    [
      "foo/agent-kit",
      {
        fullName: "foo/agent-kit",
        name: "agent-kit",
      },
    ],
    [
      "bar/agent-kit",
      {
        fullName: "bar/agent-kit",
        name: "agent-kit",
      },
    ],
  ]);
  const npmPackages = new Map([
    [
      "anthropics/claude-code",
      [
        {
          name: "@anthropic-ai/claude-code",
          homepage: "https://claude.ai/code",
        },
      ],
    ],
  ]);
  return { tracked, metadata, npmPackages };
}

test("buildRepoAliasMatchers: includes exact high-signal aliases and drops ambiguous ones", () => {
  const { tracked, metadata, npmPackages } = buildFixtures();
  const matchers = buildRepoAliasMatchers(tracked, metadata, npmPackages);

  assert.ok(
    matchers.some(
      (matcher) =>
        matcher.fullName === "anthropics/claude-code" &&
        matcher.matchType === "project_name" &&
        matcher.alias === "Claude Code",
    ),
  );
  assert.ok(
    matchers.some(
      (matcher) =>
        matcher.fullName === "anthropics/claude-code" &&
        matcher.matchType === "package_name" &&
        matcher.alias === "@anthropic-ai/claude-code",
    ),
  );
  assert.ok(
    matchers.some(
      (matcher) =>
        matcher.fullName === "NousResearch/hermes" &&
        matcher.matchType === "owner_context" &&
        matcher.alias === "hermes",
    ),
  );
  assert.ok(
    matchers.some(
      (matcher) =>
        matcher.fullName === "NousResearch/hermes-agent" &&
        matcher.matchType === "project_name" &&
        matcher.alias === "Hermes Agent",
    ),
    "allowlisted product phrases with one distinctive token should be kept",
  );
  for (const alias of ["Claude Usage", "Claude Skills", "Spec Kit", "Pi Mono"]) {
    assert.ok(
      !matchers.some(
        (matcher) =>
          matcher.matchType === "project_name" && matcher.alias === alias,
      ),
      `${alias} is too generic for a humanized project-name matcher`,
    );
  }
  assert.ok(
    !matchers.some(
      (matcher) =>
        matcher.matchType === "repo_name" &&
        matcher.alias.toLowerCase() === "agent-kit",
    ),
    "ambiguous repo_name aliases should be dropped when multiple repos share them",
  );
});

test("extractRepoMentions: matches repo slug, humanized project name, package, and owner context only", () => {
  const { tracked, metadata, npmPackages } = buildFixtures();
  const matchers = buildRepoAliasMatchers(tracked, metadata, npmPackages);

  const slugHits = extractRepoMentions(
    {
      title: "anthropics/claude-code is moving fast",
      url: "",
      selftext: "",
    },
    tracked,
    matchers,
  );
  assert.deepEqual(Array.from(slugHits.values()).map((hit) => hit.fullName), [
    "anthropics/claude-code",
  ]);

  const phraseHits = extractRepoMentions(
    {
      title: "Claude Code keeps shipping every week",
      url: "",
      selftext: "",
    },
    tracked,
    matchers,
  );
  assert.ok(phraseHits.has("anthropics/claude-code"));

  const packageHits = extractRepoMentions(
    {
      title: "installing @anthropic-ai/claude-code today",
      url: "",
      selftext: "",
    },
    tracked,
    matchers,
  );
  assert.ok(packageHits.has("anthropics/claude-code"));

  const genericClaudeUsageHits = extractRepoMentions(
    {
      title: "Claude usage went up this week",
      url: "",
      selftext: "",
    },
    tracked,
    matchers,
  );
  assert.equal(genericClaudeUsageHits.size, 0);

  const exactClaudeUsageHits = extractRepoMentions(
    {
      title: "try phuryn/claude-usage or claude-usage for local stats",
      url: "",
      selftext: "",
    },
    tracked,
    matchers,
  );
  assert.ok(exactClaudeUsageHits.has("phuryn/claude-usage"));

  const bareHermesHits = extractRepoMentions(
    {
      title: "hermes looks interesting",
      url: "",
      selftext: "",
    },
    tracked,
    matchers,
  );
  assert.equal(bareHermesHits.size, 0);

  const ownerContextHits = extractRepoMentions(
    {
      title: "Nous hermes looks promising for agents",
      url: "",
      selftext: "",
    },
    tracked,
    matchers,
  );
  assert.ok(ownerContextHits.has("nousresearch/hermes"));
  assert.equal(
    ownerContextHits.get("nousresearch/hermes").fullName,
    "NousResearch/hermes",
  );
});

test("mergeAllPosts: refreshes linked repos even when preserving an older higher score", () => {
  const existing = [
    {
      id: "post_1",
      title: "old false positive",
      url: "https://reddit.test/old",
      permalink: "/r/test/comments/post_1",
      subreddit: "test",
      createdUtc: 1000,
      score: 200,
      numComments: 2,
      ageHours: 1,
      velocity: 20,
      trendingScore: 200,
      baselineTier: "normal",
      linkedRepos: [
        {
          fullName: "mudler/LocalAI",
          matchType: "project_name",
          confidence: 0.93,
        },
      ],
      repoFullName: "mudler/LocalAI",
      selftext: "old text",
    },
  ];
  const thisRun = [
    {
      ...existing[0],
      title: "same post under stricter matcher",
      url: "https://reddit.test/new",
      score: 100,
      numComments: 7,
      ageHours: 4,
      velocity: 5,
      trendingScore: 50,
      linkedRepos: [],
      repoFullName: undefined,
      selftext: "new text",
    },
  ];

  const { posts } = mergeAllPosts(existing, thisRun, 0);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].score, 200, "older higher score should be preserved");
  assert.equal(posts[0].title, "same post under stricter matcher");
  assert.equal(posts[0].numComments, 7);
  assert.deepEqual(posts[0].linkedRepos, []);
  assert.equal(posts[0].repoFullName, undefined);
  assert.equal(posts[0].selftext, "new text");
});

test("scrubStaleProjectNameLinks: removes old project-name links that current rules no longer allow", () => {
  const { tracked, metadata, npmPackages } = buildFixtures();
  const matchers = buildRepoAliasMatchers(tracked, metadata, npmPackages);
  const posts = scrubStaleProjectNameLinks(
    [
      {
        id: "stale",
        title: "Claude usage went up",
        repoFullName: "phuryn/claude-usage",
        linkedRepos: [
          {
            fullName: "phuryn/claude-usage",
            matchType: "project_name",
            confidence: 0.93,
          },
        ],
      },
      {
        id: "trusted",
        title: "Claude Code shipped",
        repoFullName: "anthropics/claude-code",
        linkedRepos: [
          {
            fullName: "anthropics/claude-code",
            matchType: "project_name",
            confidence: 0.93,
          },
        ],
      },
    ],
    matchers,
  );

  assert.deepEqual(posts[0].linkedRepos, []);
  assert.equal(posts[0].repoFullName, undefined);
  assert.deepEqual(posts[1].linkedRepos, [
    {
      fullName: "anthropics/claude-code",
      matchType: "project_name",
      confidence: 0.93,
    },
  ]);
});

// ---------------------------------------------------------------------------
// Mentions last-good guard ("reddit zeros" postmortem, 2026-07-09)
// ---------------------------------------------------------------------------

function mkMentionsPayload(overrides = {}) {
  return {
    fetchedAt: "2026-07-09T00:00:00.000Z",
    cold: false,
    effectiveFetchMode: "oauth",
    scannedPostsTotal: 1000,
    mentions: {},
    mentionsByRepoId: {},
    allPosts: [],
    topPosts: [],
    leaderboard: [],
    ...overrides,
  };
}

test("mentions guard: empty new scan preserves the existing signal sections", () => {
  const existing = mkMentionsPayload({
    fetchedAt: "2026-07-08T00:00:00.000Z",
    mentions: { "acme/rocket": { count7d: 3, upvotes7d: 40, posts: [] } },
    mentionsByRepoId: { "acme--rocket": { count7d: 3, upvotes7d: 40, posts: [] } },
    leaderboard: [{ fullName: "acme/rocket", count7d: 3, upvotes7d: 40 }],
  });
  const degraded = mkMentionsPayload({ effectiveFetchMode: "rss-atom" });

  const { payload, guardTripped } = applyMentionsLastGoodGuard(degraded, existing);
  assert.equal(guardTripped, true);
  assert.deepEqual(Object.keys(payload.mentions), ["acme/rocket"]);
  assert.equal(payload.leaderboard.length, 1);
  // Freshness stays honest: the preserved data keeps its ORIGINAL fetchedAt.
  assert.equal(payload.fetchedAt, "2026-07-08T00:00:00.000Z");
  assert.equal(payload.lastDegradedScanAt, "2026-07-09T00:00:00.000Z");
  assert.equal(payload.lastGoodGuardTripped, true);
  // Scan metadata reflects THIS run.
  assert.equal(payload.effectiveFetchMode, "rss-atom");
});

test("mentions guard: a run WITH mentions always writes through (shrinkage allowed)", () => {
  const existing = mkMentionsPayload({
    mentions: {
      "acme/rocket": { count7d: 3, upvotes7d: 40, posts: [] },
      "beta/ship": { count7d: 2, upvotes7d: 10, posts: [] },
    },
  });
  const fresh = mkMentionsPayload({
    mentions: { "acme/rocket": { count7d: 1, upvotes7d: 5, posts: [] } },
  });
  const { payload, guardTripped } = applyMentionsLastGoodGuard(fresh, existing);
  assert.equal(guardTripped, false);
  assert.deepEqual(Object.keys(payload.mentions), ["acme/rocket"]);
});

test("mentions guard: cold start (no existing file) writes the empty scan", () => {
  const degraded = mkMentionsPayload();
  const { payload, guardTripped } = applyMentionsLastGoodGuard(degraded, null);
  assert.equal(guardTripped, false);
  assert.deepEqual(payload.mentions, {});
});

// ---------------------------------------------------------------------------
// RSS-fallback rows still produce MENTIONS (the fix for the dark channel)
// ---------------------------------------------------------------------------

test("extractRepoMentions matches rss-atom-shaped posts (score 0, no engagement)", () => {
  const tracked = new Set(["acme/rocket"]);
  const rssPost = {
    id: "t3_rss1",
    title: "acme/rocket just shipped agent support",
    selftext: "",
    url: "https://github.com/acme/rocket",
    score: 0,
    num_comments: 0,
    _source: "rss-atom",
  };
  const hits = extractRepoMentions(rssPost, tracked, []);
  assert.equal(hits.size, 1);
  assert.equal(Array.from(hits.values())[0].fullName, "acme/rocket");
});
