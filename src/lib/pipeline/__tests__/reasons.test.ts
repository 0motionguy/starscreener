// StarScreener Pipeline — tests for the reason generator + detectors.
//
// Run with: node --test --import tsx src/lib/pipeline/__tests__/reasons.test.ts
// (or wire into an npm script). Uses the built-in node:test runner so we
// don't need a heavier framework.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import type { Repo } from "../../types";
import type { SocialAggregate } from "../types";
import { REASON_METADATA } from "../reasons/codes";
import { DETECTOR_CODES, formatTimeframe } from "../reasons/detectors";
import { generateReasons, generateReasonsBatch } from "../reasons/generator";
import type { ReasonInput } from "../reasons/detectors";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

const NOW = Date.parse("2026-04-17T12:00:00.000Z");

function iso(offsetMs: number): string {
  return new Date(NOW - offsetMs).toISOString();
}

const HOUR = 3_600_000;
const DAY = 86_400_000;

function makeRepo(overrides: Partial<Repo> = {}): Repo {
  const base: Repo = {
    id: "acme--thing",
    fullName: "acme/thing",
    name: "thing",
    owner: "acme",
    ownerAvatarUrl: "https://avatars.example/acme.png",
    description: "A thing.",
    url: "https://github.com/acme/thing",
    language: "TypeScript",
    topics: [],
    categoryId: "devtools",
    stars: 1_000,
    forks: 100,
    contributors: 20,
    openIssues: 10,
    lastCommitAt: iso(2 * DAY),
    lastReleaseAt: null,
    lastReleaseTag: null,
    createdAt: iso(365 * DAY),
    starsDelta24h: 5,
    starsDelta7d: 20,
    starsDelta30d: 60,
    forksDelta7d: 2,
    contributorsDelta30d: 0,
    momentumScore: 50,
    movementStatus: "stable",
    rank: 100,
    categoryRank: 10,
    sparklineData: Array(30).fill(0),
    socialBuzzScore: 10,
    mentionCount24h: 0,
  };
  return { ...base, ...overrides };
}

function makeInput(overrides: Partial<ReasonInput> = {}): ReasonInput {
  return {
    repo: makeRepo(overrides.repo),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("recent release fires release_recent", () => {
  const input = makeInput({
    repo: makeRepo({
      lastReleaseAt: iso(3 * DAY),
      lastReleaseTag: "v1.3.2",
    }),
  });
  const result = generateReasons(input, NOW);
  assert.ok(result.codes.includes("release_recent"), `expected release_recent, got ${result.codes.join(",")}`);
});

test("3x daily average star growth fires star_velocity_up", () => {
  // 7d = 70 → daily avg 10. 24h = 50 → 5x the avg, and > 20.
  const input = makeInput({
    repo: makeRepo({
      stars: 2_000,
      starsDelta24h: 50,
      starsDelta7d: 70,
    }),
  });
  const result = generateReasons(input, NOW);
  assert.ok(result.codes.includes("star_velocity_up"), `expected star_velocity_up, got ${result.codes.join(",")}`);
});

test("10% stars in 24h fires star_spike", () => {
  // 1000 stars, +150 in 24h = 15% → spike. Also > 20 in 24h and avoids velocity.
  const input = makeInput({
    repo: makeRepo({
      stars: 1_000,
      starsDelta24h: 150,
      // Make 7d large enough that velocity ratio is < 2 but spike still fires.
      starsDelta7d: 700, // daily avg 100 → ratio 1.5x, velocity NOT fired
    }),
  });
  const result = generateReasons(input, NOW);
  assert.ok(result.codes.includes("star_spike"), `expected star_spike, got ${result.codes.join(",")}`);
});

test("rank jump of 10 places fires rank_jump", () => {
  const input = makeInput({
    previousRank: 25,
    repo: makeRepo({ rank: 15 }),
  });
  const result = generateReasons(input, NOW);
  assert.ok(result.codes.includes("rank_jump"), `expected rank_jump, got ${result.codes.join(",")}`);
});

test("isBreakout=true fires breakout_detected", () => {
  const input = makeInput({ isBreakout: true });
  const result = generateReasons(input, NOW);
  assert.ok(result.codes.includes("breakout_detected"), `expected breakout_detected, got ${result.codes.join(",")}`);
});

test("no significant signals → organic_growth fallback fires", () => {
  // Quiet repo, no recent release/commit, modest positive 7d delta, not a quiet killer.
  const input = makeInput({
    repo: makeRepo({
      stars: 500,
      starsDelta24h: 1,
      starsDelta7d: 5,
      starsDelta30d: 20,
      forksDelta7d: 0,
      contributorsDelta30d: 0,
      lastCommitAt: iso(10 * DAY),
      lastReleaseAt: null,
    }),
  });
  const result = generateReasons(input, NOW);
  assert.ok(result.details.length >= 1, "expected at least one reason in fallback");
  assert.equal(result.details[0].code, "organic_growth");
  assert.ok(result.codes.includes("organic_growth"));
});

test("summary is non-empty and under 200 chars", () => {
  const input = makeInput({
    isBreakout: true,
    repo: makeRepo({
      lastReleaseAt: iso(1 * DAY),
      lastReleaseTag: "v2.0.0",
      starsDelta24h: 300,
      starsDelta7d: 400,
      stars: 1_500,
    }),
  });
  const result = generateReasons(input, NOW);
  assert.ok(result.summary.length > 0, "summary must be non-empty");
  assert.ok(result.summary.length < 200, `summary too long: ${result.summary.length} chars`);
});

test("multiple reasons are ordered by priority desc", () => {
  // Engineer inputs so many detectors fire simultaneously.
  const social: SocialAggregate = {
    repoId: "acme--thing",
    computedAt: iso(0),
    mentionCount24h: 10,
    mentionCount7d: 40,
    platformBreakdown: { hackernews: 5, twitter: 3, reddit: 2 },
    sentimentScore: 0.4,
    influencerMentions: 2,
    totalReach: 500_000,
    buzzScore: 80,
    buzzTrend: "spiking",
  };
  const input = makeInput({
    isBreakout: true,
    previousRank: 50,
    socialAggregate: social,
    repo: makeRepo({
      stars: 1_500,
      starsDelta24h: 300,
      starsDelta7d: 400,
      forks: 500,
      forksDelta7d: 120,
      contributors: 40,
      contributorsDelta30d: 8,
      openIssues: 200,
      createdAt: iso(200 * DAY),
      lastReleaseAt: iso(6 * HOUR),
      lastReleaseTag: "v2.0.0",
      lastCommitAt: iso(2 * HOUR),
      rank: 12,
      socialBuzzScore: 85,
      mentionCount24h: 10,
    }),
  });
  const result = generateReasons(input, NOW);
  assert.ok(result.details.length >= 2, `expected >= 2 reasons, got ${result.details.length}`);

  for (let i = 0; i < result.details.length - 1; i++) {
    const pA = REASON_METADATA[result.details[i].code].priority;
    const pB = REASON_METADATA[result.details[i + 1].code].priority;
    assert.ok(pA >= pB, `details not priority-sorted: ${result.details[i].code}(${pA}) < ${result.details[i + 1].code}(${pB})`);
  }
});

test("every ReasonCode in DETECTOR_CODES has REASON_METADATA entry", () => {
  for (const code of DETECTOR_CODES) {
    assert.ok(REASON_METADATA[code], `missing REASON_METADATA for ${code}`);
    assert.ok(REASON_METADATA[code].label.length > 0, `empty label for ${code}`);
  }
  // Plus the fallback organic_growth code itself.
  assert.ok(REASON_METADATA.organic_growth, "missing REASON_METADATA for organic_growth");
});

test("every REASON_METADATA code has a valid priority 0-100", () => {
  for (const [code, meta] of Object.entries(REASON_METADATA)) {
    assert.ok(meta.priority >= 0 && meta.priority <= 100, `${code} priority out of range: ${meta.priority}`);
    assert.ok(meta.description.length > 0, `${code} has empty description`);
  }
});

test("formatTimeframe produces the expected short strings", () => {
  assert.equal(formatTimeframe(iso(2 * HOUR), NOW), "2h ago");
  assert.equal(formatTimeframe(iso(3 * DAY), NOW), "3d ago");
  assert.equal(formatTimeframe(iso(10 * DAY), NOW), "1w ago");
  assert.equal(formatTimeframe(iso(30 * 60 * 1000), NOW), "just now"); // 30 minutes
  assert.equal(formatTimeframe(null, NOW), "unknown");
  assert.equal(formatTimeframe("not-a-date", NOW), "unknown");
  assert.equal(formatTimeframe(new Date(NOW + HOUR).toISOString(), NOW), "in the future");
});

test("generateReasonsBatch processes multiple inputs", () => {
  const inputs: ReasonInput[] = [
    makeInput({ isBreakout: true }),
    makeInput({
      repo: makeRepo({
        lastReleaseAt: iso(2 * DAY),
        lastReleaseTag: "v2.0",
      }),
    }),
  ];
  const results = generateReasonsBatch(inputs, NOW);
  assert.equal(results.length, 2);
  assert.ok(results[0].codes.includes("breakout_detected"));
  assert.ok(results[1].codes.includes("release_recent") || results[1].codes.includes("release_major"));
});

test("release_major overlaps with release_recent when both apply", () => {
  const input = makeInput({
    repo: makeRepo({
      lastReleaseAt: iso(3 * DAY),
      lastReleaseTag: "v2.0.0",
    }),
  });
  const result = generateReasons(input, NOW);
  assert.ok(result.codes.includes("release_major"));
  assert.ok(result.codes.includes("release_recent"));
});

test("repoId and generatedAt are populated correctly", () => {
  const input = makeInput();
  const result = generateReasons(input, NOW);
  assert.equal(result.repoId, "acme--thing");
  assert.equal(result.generatedAt, new Date(NOW).toISOString());
});

test("top 5 cap on details", () => {
  // Force 6+ detectors to fire.
  const social: SocialAggregate = {
    repoId: "acme--thing",
    computedAt: iso(0),
    mentionCount24h: 12,
    mentionCount7d: 50,
    platformBreakdown: { hackernews: 6, twitter: 4, reddit: 2 },
    sentimentScore: 0.5,
    influencerMentions: 3,
    totalReach: 800_000,
    buzzScore: 85,
    buzzTrend: "spiking",
  };
  const input = makeInput({
    isBreakout: true,
    isQuietKiller: false,
    previousRank: 100,
    socialAggregate: social,
    categoryTopId: "acme--thing",
    repo: makeRepo({
      stars: 2_000,
      starsDelta24h: 400,
      starsDelta7d: 600,
      forks: 800,
      forksDelta7d: 200,
      contributors: 60,
      contributorsDelta30d: 10,
      openIssues: 250,
      createdAt: iso(150 * DAY),
      lastReleaseAt: iso(1 * DAY),
      lastReleaseTag: "v3.0.0",
      lastCommitAt: iso(3 * HOUR),
      rank: 20,
      socialBuzzScore: 90,
      mentionCount24h: 12,
    }),
  });
  const result = generateReasons(input, NOW);
  assert.ok(result.details.length <= 5, `expected <= 5 details, got ${result.details.length}`);
});
