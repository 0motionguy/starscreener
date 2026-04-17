// StarScreener Pipeline — alerts engine tests.
//
// Run with: node --test --import tsx/esm src/lib/pipeline/__tests__/alerts.test.ts
// (or the project's configured test runner). Uses node:test + node:assert.

import { test } from "node:test";
import assert from "node:assert/strict";

import type { Repo } from "../../types";
import type {
  AlertEvent,
  AlertEventStore,
  AlertRule,
  AlertRuleStore,
  RepoReason,
  RepoScore,
  ScoreComponents,
  ScoreModifiers,
  ScoreWeights,
} from "../types";

import {
  evaluateBreakoutDetected,
  evaluateNewRelease,
  evaluateRankJump,
  evaluateStarSpike,
  type TriggerContext,
} from "../alerts/triggers";
import {
  buildTriggerContext,
  evaluateRulesForRepo,
} from "../alerts/engine";
import {
  createRule,
  validateRule,
  DEFAULT_ALERT_SUGGESTIONS,
} from "../alerts/rule-management";
import { generateDailyDigest } from "../alerts/digest";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function mockRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: "acme--rocket",
    fullName: "acme/rocket",
    name: "rocket",
    owner: "acme",
    ownerAvatarUrl: "https://example.com/acme.png",
    description: "A fast web framework",
    url: "https://github.com/acme/rocket",
    language: "TypeScript",
    topics: ["web", "framework"],
    categoryId: "web-frameworks",
    stars: 12000,
    forks: 800,
    contributors: 150,
    openIssues: 42,
    lastCommitAt: new Date().toISOString(),
    lastReleaseAt: null,
    lastReleaseTag: null,
    createdAt: "2022-01-01T00:00:00.000Z",
    starsDelta24h: 50,
    starsDelta7d: 400,
    starsDelta30d: 1500,
    forksDelta7d: 20,
    contributorsDelta30d: 5,
    momentumScore: 60,
    movementStatus: "rising",
    rank: 25,
    categoryRank: 3,
    sparklineData: new Array(30).fill(10),
    socialBuzzScore: 40,
    mentionCount24h: 3,
    ...overrides,
  };
}

function emptyScoreComponents(): ScoreComponents {
  return {
    starVelocity24h: 0,
    starVelocity7d: 0,
    forkVelocity7d: 0,
    contributorGrowth30d: 0,
    commitFreshness: 0,
    releaseFreshness: 0,
    socialBuzz: 0,
    issueActivity: 0,
    communityHealth: 0,
    categoryMomentum: 0,
  };
}

function emptyScoreWeights(): ScoreWeights {
  return {
    starVelocity24h: 0.1,
    starVelocity7d: 0.1,
    forkVelocity7d: 0.1,
    contributorGrowth30d: 0.1,
    commitFreshness: 0.1,
    releaseFreshness: 0.1,
    socialBuzz: 0.1,
    issueActivity: 0.1,
    communityHealth: 0.1,
    categoryMomentum: 0.1,
  };
}

function emptyScoreModifiers(): ScoreModifiers {
  return {
    decayFactor: 1,
    antiSpamDampening: 1,
    breakoutMultiplier: 1,
    quietKillerBonus: 0,
  };
}

function mockScore(overrides: Partial<RepoScore> = {}): RepoScore {
  return {
    repoId: "acme--rocket",
    computedAt: new Date().toISOString(),
    overall: 60,
    components: emptyScoreComponents(),
    weights: emptyScoreWeights(),
    modifiers: emptyScoreModifiers(),
    isBreakout: false,
    isQuietKiller: false,
    movementStatus: "rising",
    explanation: "",
    ...overrides,
  };
}

function mockRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: "rule_test",
    userId: "local",
    repoId: null,
    categoryId: null,
    trigger: "star_spike",
    threshold: 100,
    cooldownMinutes: 60,
    enabled: true,
    createdAt: new Date().toISOString(),
    lastFiredAt: null,
    ...overrides,
  };
}

// Minimal in-memory stores matching the pipeline interfaces.
class MemRuleStore implements AlertRuleStore {
  private rules = new Map<string, AlertRule>();
  save(rule: AlertRule): AlertRule {
    this.rules.set(rule.id, { ...rule });
    return rule;
  }
  remove(id: string): boolean {
    return this.rules.delete(id);
  }
  listForUser(userId: string): AlertRule[] {
    return [...this.rules.values()].filter((r) => r.userId === userId);
  }
  listAll(): AlertRule[] {
    return [...this.rules.values()];
  }
}

class MemEventStore implements AlertEventStore {
  events: AlertEvent[] = [];
  append(event: AlertEvent): void {
    this.events.push(event);
  }
  listForUser(userId: string, unreadOnly?: boolean): AlertEvent[] {
    return this.events.filter(
      (e) => e.userId === userId && (!unreadOnly || e.readAt === null),
    );
  }
  markRead(id: string): void {
    const e = this.events.find((x) => x.id === id);
    if (e) e.readAt = new Date().toISOString();
  }
}

// ---------------------------------------------------------------------------
// Trigger evaluator tests
// ---------------------------------------------------------------------------

test("evaluateStarSpike fires when starsDelta24h > threshold", () => {
  const rule = mockRule({ trigger: "star_spike", threshold: 100 });
  const ctx: TriggerContext = { repo: mockRepo({ starsDelta24h: 250 }) };
  const result = evaluateStarSpike(rule, ctx);
  assert.equal(result.fired, true);
  assert.equal(result.value, 250);
  assert.match(result.title, /\+250 stars in 24h/);
});

test("evaluateStarSpike does not fire when at or below threshold", () => {
  const rule = mockRule({ trigger: "star_spike", threshold: 100 });
  const below: TriggerContext = { repo: mockRepo({ starsDelta24h: 99 }) };
  const equal: TriggerContext = { repo: mockRepo({ starsDelta24h: 100 }) };
  assert.equal(evaluateStarSpike(rule, below).fired, false);
  assert.equal(evaluateStarSpike(rule, equal).fired, false);
});

test("evaluateNewRelease detects a new release tag within 48h", () => {
  const rule = mockRule({ trigger: "new_release", threshold: 0 });
  const releasedAt = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const ctx: TriggerContext = {
    repo: mockRepo({ lastReleaseTag: "v2.0.0", lastReleaseAt: releasedAt }),
    previousRepo: mockRepo({
      lastReleaseTag: "v1.9.0",
      lastReleaseAt: "2024-01-01T00:00:00.000Z",
    }),
  };
  const result = evaluateNewRelease(rule, ctx);
  assert.equal(result.fired, true);
  assert.match(result.title, /released v2\.0\.0/);
});

test("evaluateNewRelease does not fire when tag is unchanged", () => {
  const rule = mockRule({ trigger: "new_release", threshold: 0 });
  const releasedAt = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const ctx: TriggerContext = {
    repo: mockRepo({ lastReleaseTag: "v2.0.0", lastReleaseAt: releasedAt }),
    previousRepo: mockRepo({
      lastReleaseTag: "v2.0.0",
      lastReleaseAt: releasedAt,
    }),
  };
  assert.equal(evaluateNewRelease(rule, ctx).fired, false);
});

test("evaluateRankJump fires when rank improves by threshold", () => {
  const rule = mockRule({ trigger: "rank_jump", threshold: 5 });
  const ctx: TriggerContext = {
    repo: mockRepo({ rank: 10 }),
    previousRank: 20,
  };
  const result = evaluateRankJump(rule, ctx);
  assert.equal(result.fired, true);
  assert.equal(result.value, 10);
  assert.match(result.title, /climbed 10 places to #10/);
});

test("evaluateRankJump does not fire when jump is below threshold", () => {
  const rule = mockRule({ trigger: "rank_jump", threshold: 5 });
  const ctx: TriggerContext = {
    repo: mockRepo({ rank: 18 }),
    previousRank: 20,
  };
  assert.equal(evaluateRankJump(rule, ctx).fired, false);
});

test("evaluateBreakoutDetected fires when isBreakout=true and previousScore not breakout", () => {
  const rule = mockRule({ trigger: "breakout_detected", threshold: 0 });
  const ctx: TriggerContext = {
    repo: mockRepo(),
    score: mockScore({ isBreakout: true, overall: 82 }),
    previousScore: mockScore({ isBreakout: false, overall: 50 }),
    isBreakout: true,
  };
  const result = evaluateBreakoutDetected(rule, ctx);
  assert.equal(result.fired, true);
  assert.match(result.title, /is breaking out/);
});

test("evaluateBreakoutDetected does not fire if already breakout", () => {
  const rule = mockRule({ trigger: "breakout_detected", threshold: 0 });
  const ctx: TriggerContext = {
    repo: mockRepo(),
    score: mockScore({ isBreakout: true }),
    previousScore: mockScore({ isBreakout: true }),
    isBreakout: true,
  };
  assert.equal(evaluateBreakoutDetected(rule, ctx).fired, false);
});

// ---------------------------------------------------------------------------
// Engine cooldown + scoping tests
// ---------------------------------------------------------------------------

test("cooldown prevents re-firing within window", () => {
  const ruleStore = new MemRuleStore();
  const eventStore = new MemEventStore();

  const rule = mockRule({
    id: "rule_cd",
    trigger: "star_spike",
    threshold: 100,
    cooldownMinutes: 60,
  });
  ruleStore.save(rule);

  const repo = mockRepo({ starsDelta24h: 500 });
  const ctx = buildTriggerContext(repo);

  const first = evaluateRulesForRepo(repo.id, ctx, ruleStore, eventStore);
  assert.equal(first.length, 1, "first evaluation should fire");

  const second = evaluateRulesForRepo(repo.id, ctx, ruleStore, eventStore);
  assert.equal(second.length, 0, "second evaluation within cooldown should not fire");
  assert.equal(eventStore.events.length, 1, "eventStore should have exactly one event");

  // Simulate cooldown elapsed.
  const stored = ruleStore.listAll()[0];
  const longAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  ruleStore.save({ ...stored, lastFiredAt: longAgo });

  const third = evaluateRulesForRepo(repo.id, ctx, ruleStore, eventStore);
  assert.equal(third.length, 1, "should re-fire after cooldown elapses");
});

test("global rule (repoId=null) applies to all repos", () => {
  const ruleStore = new MemRuleStore();
  const eventStore = new MemEventStore();

  ruleStore.save(
    mockRule({
      id: "global_rule",
      repoId: null,
      categoryId: null,
      trigger: "star_spike",
      threshold: 50,
      cooldownMinutes: 0,
    }),
  );

  const repoA = mockRepo({ id: "a--x", fullName: "a/x", starsDelta24h: 200 });
  const repoB = mockRepo({ id: "b--y", fullName: "b/y", starsDelta24h: 300 });

  const firedA = evaluateRulesForRepo(
    repoA.id,
    buildTriggerContext(repoA),
    ruleStore,
    eventStore,
  );
  const firedB = evaluateRulesForRepo(
    repoB.id,
    buildTriggerContext(repoB),
    ruleStore,
    eventStore,
  );

  assert.equal(firedA.length, 1);
  assert.equal(firedB.length, 1);
  assert.equal(eventStore.events.length, 2);
  assert.notEqual(firedA[0].id, firedB[0].id);
});

// ---------------------------------------------------------------------------
// Rule management tests
// ---------------------------------------------------------------------------

test("validateRule catches negative threshold", () => {
  const rule = mockRule({ threshold: -1 });
  const result = validateRule(rule);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("threshold")));
});

test("validateRule passes on a well-formed rule", () => {
  const rule = mockRule();
  const result = validateRule(rule);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("createRule generates an id and sets createdAt + defaults", () => {
  const rule = createRule({
    userId: "local",
    trigger: "star_spike",
    threshold: 100,
  });
  assert.ok(rule.id.startsWith("rule_"));
  assert.ok(rule.createdAt.length > 0);
  assert.equal(rule.enabled, true);
  assert.equal(rule.cooldownMinutes, 60);
  assert.equal(rule.repoId, null);
  assert.equal(rule.categoryId, null);
  assert.equal(rule.lastFiredAt, null);

  const v = validateRule(rule);
  assert.equal(v.valid, true, `validation errors: ${v.errors.join(", ")}`);
});

test("createRule rejects invalid trigger type", () => {
  assert.throws(() =>
    createRule({
      userId: "local",
      // @ts-expect-error — purposefully invalid
      trigger: "bogus_trigger",
      threshold: 1,
    }),
  );
});

test("DEFAULT_ALERT_SUGGESTIONS cover all trigger types with valid shape", () => {
  assert.ok(DEFAULT_ALERT_SUGGESTIONS.length >= 7);
  for (const s of DEFAULT_ALERT_SUGGESTIONS) {
    assert.ok(typeof s.label === "string" && s.label.length > 0);
    assert.ok(typeof s.description === "string" && s.description.length > 0);
    assert.ok(s.threshold >= 0);
  }
});

// ---------------------------------------------------------------------------
// Digest tests
// ---------------------------------------------------------------------------

test("digest contains up to 10 items sorted by bucket priority then score", () => {
  const repos: Repo[] = [];
  const scores = new Map<string, RepoScore>();
  const reasons = new Map<string, RepoReason>();

  // 15 repos: first 3 watchlisted with spikes, next 10 ranked momentum, rest breakouts.
  for (let i = 0; i < 15; i++) {
    const id = `owner--repo${i}`;
    const repo = mockRepo({
      id,
      fullName: `owner/repo${i}`,
      name: `repo${i}`,
      starsDelta24h: i < 3 ? 500 - i * 10 : 10 + i,
      momentumScore: 90 - i * 2,
      movementStatus: i >= 13 ? "breakout" : "rising",
    });
    repos.push(repo);
    scores.set(
      id,
      mockScore({
        repoId: id,
        overall: 90 - i * 2,
        isBreakout: i >= 13,
      }),
    );
  }

  const watchlistRepoIds = ["owner--repo0", "owner--repo1", "owner--repo2"];

  const digest = generateDailyDigest("local", {
    repos,
    scores,
    reasons,
    watchlistRepoIds,
  });

  assert.equal(digest.items.length, 10, "digest should cap at 10 items");

  // First three should be watchlist items (bucket priority 0).
  const firstThree = digest.items.slice(0, 3).map((i) => i.repoId);
  for (const id of firstThree) {
    assert.ok(
      watchlistRepoIds.includes(id),
      `expected ${id} to be a watchlist repo in the first three positions`,
    );
  }

  // Positions must be 1-indexed and monotonic.
  digest.items.forEach((item, idx) => {
    assert.equal(item.position, idx + 1);
  });

  // Period should be 24h for daily.
  const start = Date.parse(digest.periodStart);
  const end = Date.parse(digest.periodEnd);
  const hours = (end - start) / (1000 * 60 * 60);
  assert.ok(Math.abs(hours - 24) < 0.01, `daily period should be 24h, got ${hours}h`);
  assert.equal(digest.period, "daily");
  assert.equal(digest.userId, "local");
});
