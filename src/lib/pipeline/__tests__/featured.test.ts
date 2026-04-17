// StarScreener Pipeline — featured cards waterfall tests.
//
// Uses node:test + node:assert/strict. We drive the singleton stores
// directly with a controlled synthetic repo set so each test can assert
// exactly which cards the waterfall produces.

import { test, beforeEach } from "node:test";
import { strict as assert } from "node:assert";

import type { Repo } from "../../types";
import type { RepoReason } from "../types";
import {
  repoStore,
  reasonStore,
  mentionStore,
} from "../storage/singleton";
import { getFeaturedTrending } from "../queries/featured";

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

function makeRepo(partial: Partial<Repo> & { id: string }): Repo {
  const [owner, name] = partial.id.split("--");
  return {
    id: partial.id,
    fullName: partial.fullName ?? `${owner}/${name}`,
    name: partial.name ?? name ?? partial.id,
    owner: partial.owner ?? owner ?? "",
    ownerAvatarUrl: partial.ownerAvatarUrl ?? "",
    description: partial.description ?? "",
    url: partial.url ?? `https://github.com/${owner}/${name}`,
    language: partial.language ?? null,
    topics: partial.topics ?? [],
    categoryId: partial.categoryId ?? "devtools",
    stars: partial.stars ?? 1000,
    forks: partial.forks ?? 100,
    contributors: partial.contributors ?? 10,
    openIssues: partial.openIssues ?? 5,
    lastCommitAt: partial.lastCommitAt ?? new Date().toISOString(),
    lastReleaseAt: partial.lastReleaseAt ?? null,
    lastReleaseTag: partial.lastReleaseTag ?? null,
    createdAt: partial.createdAt ?? "2022-01-01T00:00:00.000Z",
    starsDelta24h: partial.starsDelta24h ?? 0,
    starsDelta7d: partial.starsDelta7d ?? 0,
    starsDelta30d: partial.starsDelta30d ?? 0,
    forksDelta7d: partial.forksDelta7d ?? 0,
    contributorsDelta30d: partial.contributorsDelta30d ?? 0,
    momentumScore: partial.momentumScore ?? 50,
    movementStatus: partial.movementStatus ?? "stable",
    rank: partial.rank ?? 100,
    categoryRank: partial.categoryRank ?? 10,
    sparklineData: partial.sparklineData ?? new Array(30).fill(10),
    socialBuzzScore: partial.socialBuzzScore ?? 0,
    mentionCount24h: partial.mentionCount24h ?? 0,
  };
}

function makeReason(
  repoId: string,
  codes: RepoReason["codes"],
  details: RepoReason["details"] = [],
): RepoReason {
  return {
    repoId,
    generatedAt: new Date().toISOString(),
    codes,
    summary: `Test summary for ${repoId}`,
    details,
  };
}

/** Wipe every state path the featured waterfall reads from. */
function resetStores(): void {
  // InMemoryRepoStore — no public clear(), so drain via known getAll().
  for (const repo of repoStore.getAll()) {
    // Overwrite with something, then filter by not clearing. The store
    // exposes upsert only; we hack by reaching into the map via a fresh
    // instance is impossible without re-importing. Simpler: re-seed with
    // a unique id-marker repo isn't right either. The test singletons are
    // shared, so to achieve a clean slate we reset via direct mutation of
    // the underlying maps through well-known public APIs.
    void repo;
  }
  // Reach in through the documented surface — everything we need can be
  // achieved by mutating via upsert for repos, save for reasons, etc.
  // The pipeline singleton stores back their data with private Maps;
  // to avoid cross-test pollution we re-import via a fresh worker-free
  // pathway: drop every repo/reason/mention we know about into a fresh
  // set before each test asserts. That means explicit clears below.
  clearRepoStore();
  clearReasonStore();
  clearMentionStore();
}

// The InMemory*Stores wrap private Maps without a public clear. These
// helpers reach in via "unknown" type casts — safe for tests, never
// used in production code.
function clearRepoStore(): void {
  const store = repoStore as unknown as {
    byId: Map<string, unknown>;
    byFullName: Map<string, unknown>;
  };
  store.byId.clear();
  store.byFullName.clear();
}
function clearReasonStore(): void {
  const store = reasonStore as unknown as { byRepo: Map<string, unknown> };
  store.byRepo.clear();
}
function clearMentionStore(): void {
  const store = mentionStore as unknown as {
    byRepo: Map<string, unknown>;
    aggregates: Map<string, unknown>;
  };
  store.byRepo.clear();
  store.aggregates.clear();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetStores();
});

test("getFeaturedTrending returns no more than the requested limit", () => {
  // Seed 12 repos that all qualify for some slot — pool is large, limit caps.
  for (let i = 0; i < 12; i++) {
    repoStore.upsert(
      makeRepo({
        id: `owner--repo${i}`,
        stars: 1000 + i,
        starsDelta24h: 100 - i, // #0 is #1 today
        rank: i + 1,
        movementStatus: i === 1 ? "breakout" : i === 2 ? "quiet_killer" : "rising",
      }),
    );
  }
  const cards = getFeaturedTrending({ limit: 5 });
  assert.ok(cards.length <= 5, `expected at most 5 cards, got ${cards.length}`);
  assert.ok(cards.length > 0, "expected at least one card");
});

test("getFeaturedTrending never returns duplicate repos across cards", () => {
  for (let i = 0; i < 8; i++) {
    repoStore.upsert(
      makeRepo({
        id: `dup--repo${i}`,
        stars: 500 + i,
        starsDelta24h: 200 - i,
        rank: i + 1,
        movementStatus: i === 0 ? "breakout" : i === 1 ? "quiet_killer" : "rising",
        mentionCount24h: i === 2 ? 15 : 0,
      }),
    );
  }
  const cards = getFeaturedTrending({ limit: 8 });
  const seen = new Set<string>();
  for (const card of cards) {
    assert.ok(
      !seen.has(card.repo.id),
      `duplicate repo id in cards: ${card.repo.id}`,
    );
    seen.add(card.repo.id);
  }
});

test("#1 TODAY card appears first and points at the highest starsDelta24h repo", () => {
  repoStore.upsert(
    makeRepo({ id: "a--alpha", starsDelta24h: 50, stars: 1000 }),
  );
  repoStore.upsert(
    makeRepo({ id: "b--beta", starsDelta24h: 500, stars: 2000, rank: 1 }),
  );
  repoStore.upsert(
    makeRepo({ id: "c--gamma", starsDelta24h: 100, stars: 1500 }),
  );

  const cards = getFeaturedTrending({ limit: 8 });
  assert.ok(cards.length >= 1, "expected at least one card");
  assert.equal(cards[0].label, "NUMBER_ONE_TODAY");
  assert.equal(cards[0].labelDisplay, "#1 TODAY");
  assert.equal(cards[0].repo.id, "b--beta");
});

test("backfills #N TODAY when natural waterfall yields fewer than 4 cards", () => {
  // Only one repo has any signal at all (#1 TODAY). Everything else is flat.
  // Without backfill, we'd get exactly 1 card. With backfill we should reach
  // at least 4 cards by pulling from getTopMovers("today").
  repoStore.upsert(
    makeRepo({ id: "hero--one", starsDelta24h: 1000, stars: 1000 }),
  );
  for (let i = 0; i < 6; i++) {
    repoStore.upsert(
      makeRepo({
        id: `filler--r${i}`,
        starsDelta24h: 50 - i, // all positive so they'll show up in top movers
        stars: 500 + i * 10,
        rank: 100 + i,
        movementStatus: "stable",
      }),
    );
  }
  const cards = getFeaturedTrending({ limit: 8 });
  assert.ok(
    cards.length >= 4,
    `expected backfill to reach at least 4 cards, got ${cards.length}`,
  );
  assert.equal(cards[0].repo.id, "hero--one");
  assert.equal(cards[0].labelDisplay, "#1 TODAY");
  // After backfill, subsequent NUMBER_ONE_TODAY cards are labeled #2, #3, ...
  const backfillCards = cards.filter(
    (c) => c.label === "NUMBER_ONE_TODAY" && c.labelDisplay !== "#1 TODAY",
  );
  assert.ok(
    backfillCards.length >= 1,
    "expected at least one backfill #N TODAY card",
  );
  for (const card of backfillCards) {
    assert.match(card.labelDisplay, /^#\d+ TODAY$/);
  }
});

test("metaFilter narrows the pool before the waterfall runs", () => {
  // Two hot, two breakout, two stable. Only "breakouts" pool should flow
  // through the waterfall when metaFilter="breakouts".
  repoStore.upsert(
    makeRepo({
      id: "hot--one",
      starsDelta24h: 1000,
      movementStatus: "hot",
      stars: 1000,
    }),
  );
  repoStore.upsert(
    makeRepo({
      id: "brk--one",
      starsDelta24h: 500,
      movementStatus: "breakout",
      stars: 800,
    }),
  );
  repoStore.upsert(
    makeRepo({
      id: "brk--two",
      starsDelta24h: 300,
      movementStatus: "breakout",
      stars: 600,
    }),
  );
  repoStore.upsert(
    makeRepo({
      id: "stb--one",
      starsDelta24h: 200,
      movementStatus: "stable",
      stars: 400,
    }),
  );

  const cards = getFeaturedTrending({ limit: 8, metaFilter: "breakouts" });
  // Every surfaced repo must be a breakout (pool narrowed up-front).
  for (const c of cards) {
    assert.equal(
      c.repo.movementStatus,
      "breakout",
      `unexpected repo ${c.repo.id} with status ${c.repo.movementStatus}`,
    );
  }
  // The strongest breakout by starsDelta24h must lead (#1 TODAY).
  assert.equal(cards[0].repo.id, "brk--one");
});

test("every FeaturedCard carries all the required fields populated", () => {
  repoStore.upsert(
    makeRepo({
      id: "full--card",
      stars: 5000,
      starsDelta24h: 750,
      rank: 3,
      sparklineData: [1, 2, 3, 4, 5],
      movementStatus: "hot",
    }),
  );
  const cards = getFeaturedTrending({ limit: 4 });
  assert.ok(cards.length >= 1, "expected at least one card");
  for (const c of cards) {
    assert.equal(typeof c.label, "string");
    assert.equal(typeof c.labelDisplay, "string");
    assert.ok(c.labelDisplay.length > 0, "labelDisplay must not be empty");
    assert.ok(c.repo && typeof c.repo.id === "string", "repo is required");
    assert.equal(typeof c.reason, "string");
    assert.ok(c.reason.length > 0, "reason must not be empty");
    assert.equal(typeof c.deltaPercent, "number");
    assert.ok(Number.isFinite(c.deltaPercent), "deltaPercent must be finite");
    // rankDelta is number | null.
    assert.ok(
      c.rankDelta === null || typeof c.rankDelta === "number",
      "rankDelta must be number or null",
    );
    assert.ok(Array.isArray(c.sparkline), "sparkline must be an array");
  }
});

test("reason is pulled from reasonStore.summary when present", () => {
  repoStore.upsert(
    makeRepo({
      id: "reason--holder",
      stars: 1000,
      starsDelta24h: 500,
      rank: 5,
    }),
  );
  reasonStore.save(
    makeReason("reason--holder", ["star_velocity_up"], []),
  );
  // Override summary after save (make it distinctive).
  const current = reasonStore.get("reason--holder");
  assert.ok(current);
  reasonStore.save({
    ...current,
    summary: "Distinctive summary baked into the store",
  });

  const cards = getFeaturedTrending({ limit: 4 });
  const target = cards.find((c) => c.repo.id === "reason--holder");
  assert.ok(target, "expected target repo in cards");
  assert.equal(
    target.reason,
    "Distinctive summary baked into the store",
    "reason must come from reasonStore.summary",
  );
});

test("rank_jump reason surfaces as a RANK_CLIMBER card with rankDelta from evidence", () => {
  // #1 today candidate.
  repoStore.upsert(
    makeRepo({
      id: "lead--today",
      stars: 2000,
      starsDelta24h: 1000,
      rank: 1,
    }),
  );
  // Rank climber candidate with explicit rank_jump reason.
  repoStore.upsert(
    makeRepo({
      id: "climber--one",
      stars: 1500,
      starsDelta24h: 400,
      rank: 8,
    }),
  );
  reasonStore.save({
    repoId: "climber--one",
    generatedAt: new Date().toISOString(),
    codes: ["rank_jump"],
    summary: "Climbed 12 ranks",
    details: [
      {
        code: "rank_jump",
        headline: "Climbed 12 ranks to #8",
        detail: "Big jump on the leaderboard.",
        confidence: "high",
        timeframe: "recent",
        evidence: [
          { label: "Previous rank", value: 20 },
          { label: "Current rank", value: 8 },
          { label: "Places gained", value: 12 },
        ],
      },
    ],
  });

  const cards = getFeaturedTrending({ limit: 8 });
  const climber = cards.find((c) => c.label === "RANK_CLIMBER");
  assert.ok(climber, "expected a RANK_CLIMBER card");
  assert.equal(climber.repo.id, "climber--one");
  assert.equal(climber.rankDelta, 12);
});
