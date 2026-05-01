// Canonical repo-profile assembler — synthesizer + invariant tests.
//
// Covers the 6 mention synthesizers (twitter / producthunt / lobsters /
// npm / huggingface / arxiv) added in the 2026-05-02 sprint plus the
// top-level invariants the assembler is contracted to maintain.
//
// Pattern mirrors src/lib/pipeline/__tests__/cross-signal.test.ts —
// node:test + assert/strict, helpers reached through the `__test` namespace
// export at the bottom of the module under test (issue #88, audit T4).
//
// Run with:
//   npx tsx --test src/lib/api/__tests__/repo-profile.test.ts

// Disable file persistence BEFORE the pipeline / assembler modules are
// imported so ensureReady() in the end-to-end test doesn't drag committed
// .data/*.jsonl rows into the assertions.
process.env.STARSCREENER_PERSIST = "false";

import { test } from "node:test";
import assert from "node:assert/strict";

import type { TwitterRepoPanel } from "../../twitter/types";
import type { Launch } from "../../producthunt";
import type { LobstersStory } from "../../lobsters";
import type { HfModelRaw } from "../../huggingface";
import type { ArxivPaperRaw } from "../../arxiv";
import type { NpmPackageRow } from "../../npm";

import { buildCanonicalRepoProfile, __test } from "../repo-profile";

const {
  PROFILE_MENTIONS_LIMIT,
  encodeCursor,
  countMentionsByPlatform,
  synthesizeTwitterMentions,
  synthesizeProductHuntMention,
  synthesizeLobstersMentions,
  synthesizeNpmMentions,
  synthesizeHuggingFaceMentions,
  synthesizeArxivMentions,
} = __test;

// ---------------------------------------------------------------------------
// Fixtures — minimal, only enough fields to satisfy the synthesizers' reads.
// Cast-through-unknown keeps us out of the business of stubbing every
// optional field on every external type.
// ---------------------------------------------------------------------------

const REPO_ID = "anthropics--claude-code";
const REPO_FULL = "anthropics/claude-code";
const NOW_ISO = "2026-05-01T12:00:00.000Z";

function makeTwitterPanel(
  posts: Array<{
    postId: string;
    confidence: "high" | "medium" | "low";
    postedAt?: string;
    engagement?: number;
  }>,
): TwitterRepoPanel {
  return {
    topPosts: posts.map((p) => ({
      postId: p.postId,
      postUrl: `https://twitter.com/u/status/${p.postId}`,
      authorHandle: "alice",
      authorAvatarUrl: null,
      postedAt: p.postedAt ?? NOW_ISO,
      text: `tweet ${p.postId}`,
      engagement: p.engagement ?? 5,
      confidence: p.confidence,
      matchedBy: "url",
      whyMatched: "test",
    })),
  } as unknown as TwitterRepoPanel;
}

function makeLaunch(overrides: Partial<Launch> = {}): Launch {
  return {
    id: "ph-001",
    name: "Test Launch",
    tagline: "tagline here",
    description: "desc",
    url: "https://www.producthunt.com/posts/test",
    website: null,
    votesCount: 42,
    commentsCount: 8,
    createdAt: NOW_ISO,
    thumbnail: null,
    topics: [],
    makers: [{ name: "Alice", username: "alice" }],
    githubUrl: null,
    linkedRepo: REPO_FULL,
    daysSinceLaunch: 0,
    ...overrides,
  } as unknown as Launch;
}

function makeLobstersStory(overrides: Partial<LobstersStory> = {}): LobstersStory {
  return {
    shortId: "abc123",
    title: "lobsters story",
    url: "https://example.com/x",
    commentsUrl: "https://lobste.rs/s/abc123",
    by: "alice",
    score: 25,
    commentCount: 7,
    createdUtc: 1735689600, // 2025-01-01T00:00:00Z
    ...overrides,
  };
}

function makeNpmPackage(overrides: Partial<NpmPackageRow> = {}): NpmPackageRow {
  return {
    name: "@scope/pkg",
    status: "ok",
    npmUrl: "https://www.npmjs.com/package/@scope/pkg",
    description: "a package",
    latestVersion: "1.0.0",
    publishedAt: NOW_ISO,
    repositoryUrl: null,
    linkedRepo: REPO_FULL,
    homepage: null,
    keywords: [],
    discovery: {
      queries: [],
      searchScore: 0,
      finalScore: 0,
      weeklyDownloads: 1234,
    },
    downloads: [],
    downloads24h: 0,
    previous24h: 0,
    delta24h: 0,
    deltaPct24h: 0,
    downloads7d: 0,
    previous7d: 0,
    delta7d: 0,
    deltaPct7d: 0,
    downloads30d: 0,
    previous30d: 0,
    delta30d: 0,
    deltaPct30d: 0,
    ...overrides,
  } as unknown as NpmPackageRow;
}

function makeHfModel(overrides: Partial<HfModelRaw> = {}): HfModelRaw {
  return {
    id: "owner/model-x",
    author: "owner",
    url: "https://huggingface.co/owner/model-x",
    downloads: 100,
    likes: 25,
    trendingScore: 0,
    pipelineTag: null,
    libraryName: null,
    tags: [],
    createdAt: null,
    lastModified: NOW_ISO,
    ...overrides,
  };
}

function makeArxivPaper(overrides: Partial<ArxivPaperRaw> = {}): ArxivPaperRaw {
  return {
    arxivId: "2501.00001",
    title: "A Paper",
    summary: "abstract",
    authors: ["Alice"],
    categories: [],
    primaryCategory: null,
    absUrl: "https://arxiv.org/abs/2501.00001",
    pdfUrl: "https://arxiv.org/pdf/2501.00001",
    publishedAt: NOW_ISO,
    updatedAt: NOW_ISO,
    linkedRepos: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// synthesizeTwitterMentions
// ---------------------------------------------------------------------------

test("synthesizeTwitterMentions: empty / null panel returns []", () => {
  assert.deepEqual(synthesizeTwitterMentions(null, REPO_ID, NOW_ISO), []);
  assert.deepEqual(
    synthesizeTwitterMentions(
      { topPosts: [] } as unknown as TwitterRepoPanel,
      REPO_ID,
      NOW_ISO,
    ),
    [],
  );
});

test("synthesizeTwitterMentions: confidence high→1.0, medium→0.6, low→0.3", () => {
  const panel = makeTwitterPanel([
    { postId: "h", confidence: "high" },
    { postId: "m", confidence: "medium" },
    { postId: "l", confidence: "low" },
  ]);
  const out = synthesizeTwitterMentions(panel, REPO_ID, NOW_ISO);
  assert.equal(out.length, 3);
  const byId = Object.fromEntries(out.map((m) => [m.id, m.confidence]));
  assert.equal(byId["twitter-h"], 1.0);
  assert.equal(byId["twitter-m"], 0.6);
  assert.equal(byId["twitter-l"], 0.3);
});

test("synthesizeTwitterMentions: namespaces IDs with twitter- prefix and platform=twitter", () => {
  const panel = makeTwitterPanel([{ postId: "p1", confidence: "high" }]);
  const [m] = synthesizeTwitterMentions(panel, REPO_ID, NOW_ISO);
  assert.equal(m.id, "twitter-p1");
  assert.equal(m.platform, "twitter");
  assert.equal(m.repoId, REPO_ID);
});

// ---------------------------------------------------------------------------
// synthesizeProductHuntMention
// ---------------------------------------------------------------------------

test("synthesizeProductHuntMention: null launch returns null", () => {
  assert.equal(synthesizeProductHuntMention(null, REPO_ID, NOW_ISO), null);
});

test("synthesizeProductHuntMention: engagement = votesCount + commentsCount", () => {
  const launch = makeLaunch({ votesCount: 42, commentsCount: 8 });
  const m = synthesizeProductHuntMention(launch, REPO_ID, NOW_ISO);
  assert.ok(m, "expected a mention");
  assert.equal(m!.engagement, 50);
});

test("synthesizeProductHuntMention: namespaces ID with producthunt- prefix", () => {
  const launch = makeLaunch({ id: "ph-xyz" });
  const m = synthesizeProductHuntMention(launch, REPO_ID, NOW_ISO);
  assert.ok(m);
  assert.equal(m!.id, "producthunt-ph-xyz");
  assert.equal(m!.platform, "producthunt");
});

// ---------------------------------------------------------------------------
// synthesizeLobstersMentions
// ---------------------------------------------------------------------------

test("synthesizeLobstersMentions: empty / undefined → []", () => {
  assert.deepEqual(synthesizeLobstersMentions(undefined, REPO_ID, NOW_ISO), []);
  assert.deepEqual(synthesizeLobstersMentions([], REPO_ID, NOW_ISO), []);
});

test("synthesizeLobstersMentions: postedAt reconstructed from createdUtc seconds", () => {
  // 1735689600 → 2025-01-01T00:00:00.000Z
  const story = makeLobstersStory({ createdUtc: 1735689600 });
  const [m] = synthesizeLobstersMentions([story], REPO_ID, NOW_ISO);
  assert.equal(m.postedAt, "2025-01-01T00:00:00.000Z");
});

test("synthesizeLobstersMentions: namespaces ID with lobsters- prefix + engagement = score + commentCount", () => {
  const story = makeLobstersStory({ shortId: "zz9", score: 10, commentCount: 4 });
  const [m] = synthesizeLobstersMentions([story], REPO_ID, NOW_ISO);
  assert.equal(m.id, "lobsters-zz9");
  assert.equal(m.platform, "lobsters");
  assert.equal(m.engagement, 14);
});

// ---------------------------------------------------------------------------
// synthesizeNpmMentions
// ---------------------------------------------------------------------------

test("synthesizeNpmMentions: empty packages → []", () => {
  assert.deepEqual(synthesizeNpmMentions([], REPO_ID, NOW_ISO), []);
});

test("synthesizeNpmMentions: skips packages with no publishedAt + namespaces ID with npm-", () => {
  const ok = makeNpmPackage({ name: "good-pkg", publishedAt: NOW_ISO });
  const skipped = makeNpmPackage({ name: "no-date", publishedAt: null });
  const out = synthesizeNpmMentions([ok, skipped], REPO_ID, NOW_ISO);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "npm-good-pkg");
  assert.equal(out[0].platform, "npm");
});

// ---------------------------------------------------------------------------
// synthesizeHuggingFaceMentions
// ---------------------------------------------------------------------------

test("synthesizeHuggingFaceMentions: empty inputs → []", () => {
  assert.deepEqual(
    synthesizeHuggingFaceMentions(undefined, [], REPO_ID, NOW_ISO),
    [],
  );
  assert.deepEqual(
    synthesizeHuggingFaceMentions(["a/b"], [], REPO_ID, NOW_ISO),
    [],
  );
});

test("synthesizeHuggingFaceMentions: only emits IDs that resolve in the trending cache + namespaces ID", () => {
  const known = makeHfModel({ id: "owner/known", likes: 5, downloads: 95 });
  const out = synthesizeHuggingFaceMentions(
    ["owner/known", "owner/missing"],
    [known],
    REPO_ID,
    NOW_ISO,
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "huggingface-owner/known");
  assert.equal(out[0].platform, "huggingface");
  assert.equal(out[0].engagement, 100); // likes + downloads
});

// ---------------------------------------------------------------------------
// synthesizeArxivMentions
// ---------------------------------------------------------------------------

test("synthesizeArxivMentions: empty papers → []", () => {
  assert.deepEqual(
    synthesizeArxivMentions(["2501.00001"], REPO_FULL, [], REPO_ID, NOW_ISO),
    [],
  );
});

test("synthesizeArxivMentions: dedupes by bare arxivId across linkedArxivIds + paper.linkedRepos paths", () => {
  // Two papers — same bare ID, one matched via linkedArxivIds (with version
  // suffix), one matched via paper.linkedRepos. Should yield exactly one
  // mention thanks to the version-strip dedupe.
  const p1 = makeArxivPaper({ arxivId: "2501.00001v2" });
  const p2 = makeArxivPaper({
    arxivId: "2501.00001",
    linkedRepos: [{ fullName: REPO_FULL, matchType: "url", confidence: 1 }],
  } as unknown as Partial<ArxivPaperRaw>);
  const out = synthesizeArxivMentions(
    ["2501.00001"],
    REPO_FULL,
    [p1, p2],
    REPO_ID,
    NOW_ISO,
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "arxiv-2501.00001");
  assert.equal(out[0].platform, "arxiv");
});

// ---------------------------------------------------------------------------
// Cross-platform ID-namespacing invariant — synth IDs never collide.
// ---------------------------------------------------------------------------

test("synthesizers: IDs are namespaced per-platform and never collide", () => {
  const t = synthesizeTwitterMentions(
    makeTwitterPanel([{ postId: "X", confidence: "high" }]),
    REPO_ID,
    NOW_ISO,
  );
  const ph = synthesizeProductHuntMention(makeLaunch({ id: "X" }), REPO_ID, NOW_ISO);
  const lob = synthesizeLobstersMentions(
    [makeLobstersStory({ shortId: "X" })],
    REPO_ID,
    NOW_ISO,
  );
  const npm = synthesizeNpmMentions([makeNpmPackage({ name: "X" })], REPO_ID, NOW_ISO);
  const hf = synthesizeHuggingFaceMentions(
    ["X"],
    [makeHfModel({ id: "X" })],
    REPO_ID,
    NOW_ISO,
  );
  const arx = synthesizeArxivMentions(
    ["X"],
    REPO_FULL,
    [makeArxivPaper({ arxivId: "X" })],
    REPO_ID,
    NOW_ISO,
  );
  const ids = new Set<string>([
    ...t.map((m) => m.id),
    ...(ph ? [ph.id] : []),
    ...lob.map((m) => m.id),
    ...npm.map((m) => m.id),
    ...hf.map((m) => m.id),
    ...arx.map((m) => m.id),
  ]);
  // 6 platforms, 1 mention each, all should be distinct → set size 6.
  assert.equal(ids.size, 6, `expected 6 unique IDs, got ${[...ids].join(",")}`);
  // Every ID must carry its platform prefix.
  assert.ok([...ids].every((id) =>
    /^(twitter|producthunt|lobsters|npm|huggingface|arxiv)-/.test(id),
  ));
});

// ---------------------------------------------------------------------------
// Helpers — countMentionsByPlatform + cursor round-trip
// ---------------------------------------------------------------------------

test("countMentionsByPlatform: tallies the FULL set, not capped", () => {
  // Build N mentions all on twitter to prove the count is not bounded by
  // PROFILE_MENTIONS_LIMIT (the cap applies only to the recent slice).
  const panel = makeTwitterPanel(
    Array.from({ length: PROFILE_MENTIONS_LIMIT + 5 }, (_, i) => ({
      postId: `p${i}`,
      confidence: "high" as const,
    })),
  );
  const synth = synthesizeTwitterMentions(panel, REPO_ID, NOW_ISO);
  const counts = countMentionsByPlatform(synth);
  assert.equal(counts.twitter, PROFILE_MENTIONS_LIMIT + 5);
});

test("PROFILE_MENTIONS_LIMIT is 50 (assembler contract)", () => {
  assert.equal(PROFILE_MENTIONS_LIMIT, 50);
});

test("encodeCursor: round-trips through the /mentions endpoint decoder shape", () => {
  const cursor = { postedAt: "2026-04-22T12:00:00.000Z", id: "canon-r-01" };
  const encoded = encodeCursor(cursor);
  // Mirror the decode in src/app/api/repos/[owner]/[name]/mentions/route.ts:
  // base64url → utf8 → JSON.parse → { postedAt, id }.
  const decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  assert.deepEqual(decoded, cursor);
});

// ---------------------------------------------------------------------------
// buildCanonicalRepoProfile end-to-end — only assert null-on-unknown to
// keep this fast (loaders + ensureReady are exercised in
// canonical-profile-endpoint.test.ts).
// ---------------------------------------------------------------------------

test("buildCanonicalRepoProfile: returns null for unknown repo", async () => {
  const out = await buildCanonicalRepoProfile(
    "definitely-not-an-owner/definitely-not-a-repo-xyz-9999",
  );
  assert.equal(out, null);
});
