// StarScreener Pipeline — mention-aggregator tests.
//
// Verifies the F-DATA-social-persist Phase 2 reader-side roll-up:
//   - count_24h respects the time window (mentions outside it are ignored)
//   - empty input → empty aggregate list (graceful)
//   - corrupted JSONL line in mentions.jsonl is skipped, others persist
//   - buzzScore is normalised to 0-100 and reflects volume + sources
//   - aggregateAndPersist round-trips to .data/mention-aggregates.jsonl

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { RepoMention, SocialAggregate } from "../types";

interface Harness {
  dir: string;
  filePersistence: typeof import("../storage/file-persistence");
  mentionStore: typeof import("../storage/mention-store");
  agg: typeof import("../aggregation/mention-aggregates");
}

async function setupHarness(): Promise<Harness> {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "starscreener-magg-"),
  );
  process.env.STARSCREENER_DATA_DIR = dir;
  delete process.env.STARSCREENER_PERSIST;

  const bust = `${Date.now()}-${Math.random()}`;
  const filePersistenceUrl = new URL(
    `../storage/file-persistence.ts?t=${bust}`,
    import.meta.url,
  );
  const mentionStoreUrl = new URL(
    `../storage/mention-store.ts?t=${bust}`,
    import.meta.url,
  );
  const aggUrl = new URL(
    `../aggregation/mention-aggregates.ts?t=${bust}`,
    import.meta.url,
  );
  const filePersistence = (await import(
    filePersistenceUrl.href,
  )) as Harness["filePersistence"];
  const mentionStore = (await import(
    mentionStoreUrl.href,
  )) as Harness["mentionStore"];
  const agg = (await import(aggUrl.href)) as Harness["agg"];
  return { dir, filePersistence, mentionStore, agg };
}

async function teardown(h: Harness): Promise<void> {
  await fs.rm(h.dir, { recursive: true, force: true });
  delete process.env.STARSCREENER_DATA_DIR;
  delete process.env.STARSCREENER_PERSIST;
}

const NOW = new Date("2026-04-26T12:00:00.000Z");

function ago(hours: number): string {
  return new Date(NOW.getTime() - hours * 3600_000).toISOString();
}

function mkMention(
  overrides: Partial<RepoMention> & {
    id: string;
    url: string;
    postedAt?: string;
    platform?: RepoMention["platform"];
  },
): RepoMention {
  return {
    id: overrides.id,
    repoId: overrides.repoId ?? "vercel--next-js",
    platform: overrides.platform ?? "hackernews",
    author: overrides.author ?? "alice",
    authorFollowers: overrides.authorFollowers ?? null,
    content: overrides.content ?? "neat",
    url: overrides.url,
    sentiment: overrides.sentiment ?? "neutral",
    engagement: overrides.engagement ?? 0,
    reach: overrides.reach ?? 0,
    postedAt: overrides.postedAt ?? ago(1),
    discoveredAt: overrides.discoveredAt ?? ago(0),
    isInfluencer: overrides.isInfluencer ?? false,
  };
}

let harness: Harness;

beforeEach(async () => {
  harness = await setupHarness();
});

afterEach(async () => {
  await teardown(harness);
});

// ---------------------------------------------------------------------------
// Pure aggregator tests
// ---------------------------------------------------------------------------

test("count_24h respects the 24h window", () => {
  const mentions: RepoMention[] = [
    mkMention({ id: "1", url: "u/1", postedAt: ago(2) }),       // in 24h
    mkMention({ id: "2", url: "u/2", postedAt: ago(23) }),      // in 24h
    mkMention({ id: "3", url: "u/3", postedAt: ago(25) }),      // outside 24h
    mkMention({ id: "4", url: "u/4", postedAt: ago(72) }),      // outside 24h
  ];
  const out = harness.agg.aggregateRepoMentions("vercel--next-js", mentions, NOW);
  assert.equal(out.mentionCount24h, 2);
});

test("count_7d respects the 7-day window", () => {
  const mentions: RepoMention[] = [
    mkMention({ id: "1", url: "u/1", postedAt: ago(2) }),         // in 7d
    mkMention({ id: "2", url: "u/2", postedAt: ago(24 * 6) }),    // in 7d
    mkMention({ id: "3", url: "u/3", postedAt: ago(24 * 8) }),    // outside 7d
  ];
  const out = harness.agg.aggregateRepoMentions("vercel--next-js", mentions, NOW);
  assert.equal(out.mentionCount7d, 2);
  assert.equal(out.mentionCount24h, 1);
});

test("empty mention list → aggregate with all zeros (no NaN, no negatives)", () => {
  const out = harness.agg.aggregateRepoMentions("any--repo", [], NOW);
  assert.equal(out.mentionCount24h, 0);
  assert.equal(out.mentionCount7d, 0);
  assert.equal(out.influencerMentions, 0);
  assert.equal(out.totalReach, 0);
  assert.equal(out.sentimentScore, 0);
  assert.equal(out.buzzScore, 0);
  assert.equal(out.buzzTrend, "quiet");
});

test("buildAggregates groups by repoId and emits one record per repo", () => {
  const mentions: RepoMention[] = [
    mkMention({ id: "1", url: "u/1", repoId: "alpha", postedAt: ago(1) }),
    mkMention({ id: "2", url: "u/2", repoId: "alpha", postedAt: ago(1) }),
    mkMention({ id: "3", url: "u/3", repoId: "beta", postedAt: ago(1) }),
  ];
  const aggs = harness.agg.buildAggregates(mentions, NOW);
  assert.equal(aggs.length, 2);
  const byRepo = new Map(aggs.map((a) => [a.repoId, a]));
  assert.equal(byRepo.get("alpha")?.mentionCount24h, 2);
  assert.equal(byRepo.get("beta")?.mentionCount24h, 1);
});

test("buildAggregates returns [] when no mentions provided", () => {
  const aggs = harness.agg.buildAggregates([], NOW);
  assert.deepEqual(aggs, []);
});

test("buzzScore is normalised to 0-100 and grows with volume", () => {
  const low = harness.agg.computeBuzzScore({
    count24h: 1,
    count7d: 1,
    sourcesActive: 1,
    influencerMentions: 0,
    sentimentScore: 0,
  });
  const mid = harness.agg.computeBuzzScore({
    count24h: 50,
    count7d: 200,
    sourcesActive: 3,
    influencerMentions: 2,
    sentimentScore: 0.5,
  });
  const high = harness.agg.computeBuzzScore({
    count24h: 200,
    count7d: 1000,
    sourcesActive: 6,
    influencerMentions: 25,
    sentimentScore: 1,
  });

  assert.ok(low >= 0 && low <= 100, "low buzz in [0,100]");
  assert.ok(mid >= 0 && mid <= 100, "mid buzz in [0,100]");
  assert.ok(high >= 0 && high <= 100, "high buzz in [0,100]");
  assert.ok(mid > low, "more mentions → higher score");
  assert.ok(high > mid, "even more mentions → higher score");
  // High end maxes at 100 when every input is at saturation cap.
  assert.equal(high, 100, "all-cap inputs should saturate at 100");
});

test("classifyBuzzTrend labels spikes / steady / fading correctly", () => {
  // 10 today, 1 per day for the rest of the week → spiking
  assert.equal(harness.agg.classifyBuzzTrend(10, 16), "spiking");
  // 1 today, ~1 per day baseline → steady
  assert.equal(harness.agg.classifyBuzzTrend(1, 7), "steady");
  // 0 today, 6 mentions in the last 6 days → fading
  assert.equal(harness.agg.classifyBuzzTrend(0, 6), "fading");
  // No activity at all → quiet
  assert.equal(harness.agg.classifyBuzzTrend(0, 0), "quiet");
});

test("influencerMentions counts only mentions flagged isInfluencer", () => {
  const out = harness.agg.aggregateRepoMentions(
    "vercel--next-js",
    [
      mkMention({ id: "1", url: "u/1", isInfluencer: true }),
      mkMention({ id: "2", url: "u/2", isInfluencer: false }),
      mkMention({ id: "3", url: "u/3", isInfluencer: true }),
    ],
    NOW,
  );
  assert.equal(out.influencerMentions, 2);
});

test("totalReach sums per-mention reach (ignores non-finite entries)", () => {
  const out = harness.agg.aggregateRepoMentions(
    "vercel--next-js",
    [
      mkMention({ id: "1", url: "u/1", reach: 1000 }),
      mkMention({ id: "2", url: "u/2", reach: 500 }),
      mkMention({ id: "3", url: "u/3", reach: Number.NaN }),
    ],
    NOW,
  );
  assert.equal(out.totalReach, 1500);
});

test("platformBreakdown counts mentions per platform", () => {
  const out = harness.agg.aggregateRepoMentions(
    "vercel--next-js",
    [
      mkMention({ id: "1", url: "u/1", platform: "hackernews" }),
      mkMention({ id: "2", url: "u/2", platform: "hackernews" }),
      mkMention({ id: "3", url: "u/3", platform: "reddit" }),
      mkMention({ id: "4", url: "u/4", platform: "bluesky" }),
    ],
    NOW,
  );
  assert.equal(out.platformBreakdown.hackernews, 2);
  assert.equal(out.platformBreakdown.reddit, 1);
  assert.equal(out.platformBreakdown.bluesky, 1);
});

// ---------------------------------------------------------------------------
// Persistence tests
// ---------------------------------------------------------------------------

test("aggregateAndPersist with empty mentions file → empty aggregates file", async () => {
  const out = await harness.agg.aggregateAndPersist(NOW);
  assert.deepEqual(out, []);

  const filePath = path.join(
    harness.dir,
    harness.filePersistence.FILES.mentionAggregates,
  );
  // Empty array still writes a 0-byte file (caller can tell "ran" vs "never ran").
  const stat = await fs.stat(filePath);
  assert.equal(stat.size, 0);
});

test("aggregateAndPersist round-trips real mentions to mention-aggregates.jsonl", async () => {
  const m1 = mkMention({
    id: "hn-1",
    url: "https://github.com/vercel/next.js",
    postedAt: ago(2),
    isInfluencer: true,
    reach: 500,
  });
  const m2 = mkMention({
    id: "rd-1",
    platform: "reddit",
    url: "https://reddit.com/r/javascript/comments/abc/next_js_15",
    postedAt: ago(10),
    reach: 200,
  });
  const m3 = mkMention({
    id: "hn-9",
    url: "https://news.ycombinator.com/item?id=9",
    postedAt: ago(24 * 5),
  });
  await harness.mentionStore.appendMentionsToFile([m1, m2, m3]);

  const aggs = await harness.agg.aggregateAndPersist(NOW);
  assert.equal(aggs.length, 1);
  const a = aggs[0];
  assert.equal(a.repoId, "vercel--next-js");
  assert.equal(a.mentionCount24h, 2);
  assert.equal(a.mentionCount7d, 3);
  assert.equal(a.influencerMentions, 1);
  assert.equal(a.totalReach, 700);
  assert.ok(a.buzzScore > 0, "buzzScore should be positive given activity");
  assert.ok(a.buzzScore <= 100, "buzzScore must stay normalised to ≤100");

  // The on-disk JSONL should contain exactly one line for this repo.
  const filePath = path.join(
    harness.dir,
    harness.filePersistence.FILES.mentionAggregates,
  );
  const raw = await fs.readFile(filePath, "utf8");
  const lines = raw.trim().split("\n").filter((l) => l.length > 0);
  assert.equal(lines.length, 1);
  const restored = JSON.parse(lines[0]) as SocialAggregate;
  assert.equal(restored.repoId, "vercel--next-js");
  assert.equal(restored.buzzScore, a.buzzScore);
});

test("aggregateAndPersist skips corrupted mention lines but processes survivors", async () => {
  const filePath = path.join(harness.dir, harness.filePersistence.FILES.mentions);
  const valid = mkMention({
    id: "hn-1",
    url: "https://github.com/vercel/next.js",
    postedAt: ago(1),
  });
  const lines = [
    JSON.stringify(valid),
    "this-is-garbage",
    JSON.stringify(
      mkMention({
        id: "hn-2",
        url: "https://github.com/vercel/next.js/issues/9",
        postedAt: ago(2),
      }),
    ),
  ];
  await fs.writeFile(filePath, lines.join("\n") + "\n", "utf8");

  const aggs = await harness.agg.aggregateAndPersist(NOW);
  assert.equal(aggs.length, 1);
  assert.equal(aggs[0].mentionCount24h, 2);
});

// ---------------------------------------------------------------------------
// Kill-switch
// ---------------------------------------------------------------------------

test("aggregateAndPersist returns [] and writes nothing when persistence is disabled", async () => {
  process.env.STARSCREENER_PERSIST = "false";
  const out = await harness.agg.aggregateAndPersist(NOW);
  assert.deepEqual(out, []);
  const filePath = path.join(
    harness.dir,
    harness.filePersistence.FILES.mentionAggregates,
  );
  await assert.rejects(
    () => fs.stat(filePath),
    (err: NodeJS.ErrnoException) => err.code === "ENOENT",
  );
});
