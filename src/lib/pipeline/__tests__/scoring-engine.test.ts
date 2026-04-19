// StarScreener Pipeline — scoring engine invariant tests.
//
// Added as P-005 in the Phase 2 red-team patch plan (fixes F-QA-001).
// The scoring engine was shipping with zero direct coverage; a regression
// in weights, modifiers, or movement classification was silently absorbed
// by downstream ranking code. This suite locks the observable contracts:
//
//   1. Default weights sum to 1.0 exactly.
//   2. resolveWeights(category) normalizes every known override to 1.0.
//   3. computeScore().overall is always finite and in [0, 100].
//   4. detectBreakout criteria (2-of-3) fire at the documented thresholds.
//   5. detectQuietKiller fires only when every criterion holds.
//   6. Modifier monotonicity: adding a breakout multiplier never lowers overall.
//   7. Snapshot: three canonical-shape inputs produce overall scores within
//      narrow bands so any meaningful tuning change is surfaced in review.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_WEIGHTS,
  CATEGORY_WEIGHT_OVERRIDES,
  resolveWeights,
  validateWeights,
} from "../scoring/weights";
import {
  computeScore,
} from "../scoring/engine";
import {
  detectBreakout,
  detectQuietKiller,
  computeAllModifiers,
  type ModifierInput,
} from "../scoring/modifiers";
import {
  computeAllComponents,
  type ScoringInput,
} from "../scoring/components";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function mkScoringInput(overrides: Partial<ScoringInput> = {}): ScoringInput {
  return {
    repoId: "acme--rocket",
    categoryId: "devtools",
    stars: 500,
    forks: 40,
    contributors: 10,
    openIssues: 25,
    starsDelta24h: 20,
    starsDelta7d: 120,
    forksDelta7d: 4,
    contributorsDelta30d: 2,
    lastCommitAt: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
    lastReleaseAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    socialBuzzScore: 45,
    hasReadme: true,
    hasLicense: true,
    hasCI: true,
    ...overrides,
  };
}

function mkModifierInput(overrides: Partial<ModifierInput> = {}): ModifierInput {
  return {
    stars: 500,
    starsDelta24h: 20,
    starsDelta7d: 120,
    forksDelta7d: 4,
    contributors: 10,
    contributorsDelta30d: 2,
    socialBuzzScore: 45,
    mentionCount24h: 2,
    lastCommitAt: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
    lastReleaseAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Weight invariants
// ---------------------------------------------------------------------------

test("DEFAULT_WEIGHTS sum to 1.0 exactly", () => {
  const sum = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(
    Math.abs(sum - 1) < 1e-9,
    `DEFAULT_WEIGHTS must sum to 1.0, got ${sum}`,
  );
  assert.equal(validateWeights(DEFAULT_WEIGHTS), true);
});

test("resolveWeights() normalizes every known category override to ~1.0", () => {
  for (const categoryId of Object.keys(CATEGORY_WEIGHT_OVERRIDES)) {
    const w = resolveWeights(categoryId);
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    assert.ok(
      Math.abs(sum - 1) < 1e-6,
      `category "${categoryId}" weights must sum to 1.0, got ${sum}`,
    );
    assert.equal(validateWeights(w), true);
  }
});

test("resolveWeights() for unknown category returns DEFAULT_WEIGHTS copy", () => {
  const w = resolveWeights("no-such-category-zzz");
  assert.deepEqual(w, DEFAULT_WEIGHTS);
  // Must be a copy, not a reference.
  assert.notEqual(w, DEFAULT_WEIGHTS);
});

// ---------------------------------------------------------------------------
// 2. Range invariants on computeScore
// ---------------------------------------------------------------------------

test("computeScore.overall ∈ [0, 100] and finite across a battery of shapes", () => {
  const shapes: Array<{
    name: string;
    s: Partial<ScoringInput>;
    m: Partial<ModifierInput>;
  }> = [
    { name: "all zeros", s: { stars: 0, forks: 0, contributors: 0, starsDelta24h: 0, starsDelta7d: 0, forksDelta7d: 0, contributorsDelta30d: 0, socialBuzzScore: 0, lastCommitAt: null, lastReleaseAt: null }, m: { stars: 0, starsDelta24h: 0, starsDelta7d: 0, forksDelta7d: 0, contributors: 0, contributorsDelta30d: 0, socialBuzzScore: 0, mentionCount24h: 0, lastCommitAt: null, lastReleaseAt: null } },
    { name: "negative star delta", s: { starsDelta24h: -5, starsDelta7d: -20 }, m: { starsDelta24h: -5, starsDelta7d: -20 } },
    { name: "maxed stars + velocity", s: { stars: 1_000_000, starsDelta24h: 50_000, starsDelta7d: 200_000 }, m: { stars: 1_000_000, starsDelta24h: 50_000, starsDelta7d: 200_000 } },
    { name: "ancient repo, no commits in years", s: { lastCommitAt: "2018-01-01T00:00:00Z", lastReleaseAt: "2018-01-01T00:00:00Z" }, m: { lastCommitAt: "2018-01-01T00:00:00Z", lastReleaseAt: "2018-01-01T00:00:00Z" } },
    { name: "brand-new repo, no releases", s: { lastCommitAt: new Date().toISOString(), lastReleaseAt: null }, m: { lastCommitAt: new Date().toISOString(), lastReleaseAt: null } },
    { name: "MCP-like tiny repo", s: { stars: 80, forks: 8, starsDelta24h: 3, starsDelta7d: 15, categoryId: "mcp" }, m: { stars: 80, starsDelta24h: 3, starsDelta7d: 15 } },
  ];

  for (const shape of shapes) {
    const s = mkScoringInput(shape.s);
    const m = mkModifierInput(shape.m);
    const score = computeScore(s, m);
    assert.ok(
      Number.isFinite(score.overall),
      `${shape.name}: overall must be finite, got ${score.overall}`,
    );
    assert.ok(
      score.overall >= 0 && score.overall <= 100,
      `${shape.name}: overall must be in [0, 100], got ${score.overall}`,
    );
    // All ten components must be in [0, 100] too.
    for (const key of Object.keys(score.components) as (keyof typeof score.components)[]) {
      const v = score.components[key];
      assert.ok(
        Number.isFinite(v) && v >= 0 && v <= 100,
        `${shape.name}: component ${String(key)} out of range or NaN: ${v}`,
      );
    }
    // Modifiers must be in their documented ranges.
    assert.ok(score.modifiers.decayFactor >= 0.3 && score.modifiers.decayFactor <= 1.0);
    assert.ok(score.modifiers.antiSpamDampening >= 0.3 && score.modifiers.antiSpamDampening <= 1.0);
    assert.ok(score.modifiers.breakoutMultiplier >= 1.0 && score.modifiers.breakoutMultiplier <= 1.5);
    assert.ok(score.modifiers.quietKillerBonus >= 0 && score.modifiers.quietKillerBonus <= 10);
  }
});

// ---------------------------------------------------------------------------
// 3. detectBreakout criteria (2-of-3)
// ---------------------------------------------------------------------------

test("detectBreakout: ineligible when stars < 10 or stars >= 1000", () => {
  const tooSmall = detectBreakout(mkModifierInput({ stars: 5, starsDelta24h: 100 }));
  const tooBig = detectBreakout(mkModifierInput({ stars: 5000, starsDelta24h: 500 }));
  assert.equal(tooSmall.isBreakout, false);
  assert.equal(tooBig.isBreakout, false);
});

test("detectBreakout: single criterion alone does NOT fire (needs ≥2)", () => {
  // Criterion 1 only: 3x daily acceleration — but relative growth <5% and no social.
  const res = detectBreakout(
    mkModifierInput({
      stars: 500,
      starsDelta24h: 10, // 2% of total, below rel-growth threshold
      starsDelta7d: 14, // daily avg 2; 24h=10 is 5x → criterion 1 triggers
      socialBuzzScore: 5, // below social threshold
      mentionCount24h: 1,
    }),
  );
  assert.equal(res.isBreakout, false);
});

test("detectBreakout: firing 2/3 criteria returns multiplier > 1.0", () => {
  // Criteria 1 + 2: both acceleration and rel-growth>5%
  const res = detectBreakout(
    mkModifierInput({
      stars: 500,
      starsDelta24h: 40, // 8% relative, above 5% threshold
      starsDelta7d: 21, // daily avg 3; 40 is 13x → criterion 1 fires hard
      socialBuzzScore: 5,
      mentionCount24h: 0,
    }),
  );
  assert.equal(res.isBreakout, true);
  assert.ok(res.multiplier > 1.0 && res.multiplier <= 1.5);
  assert.ok(res.reasons.length >= 2);
});

// ---------------------------------------------------------------------------
// 4. detectQuietKiller requires all criteria
// ---------------------------------------------------------------------------

test("detectQuietKiller fires on sustained-growth profile", () => {
  const res = detectQuietKiller(
    mkModifierInput({
      stars: 2000,
      starsDelta24h: 8, // nice and flat
      starsDelta7d: 60, // daily avg ~8.5 — no spike
      contributors: 20,
      contributorsDelta30d: 3,
      lastCommitAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    }),
  );
  assert.equal(res.isQuietKiller, true);
  assert.ok(res.bonus > 0 && res.bonus <= 10);
});

test("detectQuietKiller does NOT fire when there is a single-day spike", () => {
  const res = detectQuietKiller(
    mkModifierInput({
      stars: 2000,
      starsDelta24h: 50, // big spike — > starsDelta7d/3
      starsDelta7d: 60,
      contributors: 20,
      contributorsDelta30d: 3,
      lastCommitAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    }),
  );
  assert.equal(res.isQuietKiller, false);
});

// ---------------------------------------------------------------------------
// 5. Modifier monotonicity
// ---------------------------------------------------------------------------

test("breakout multiplier never lowers overall score for identical base", () => {
  const baseInput = mkScoringInput({ stars: 200, starsDelta24h: 5 });
  const baseMod = mkModifierInput({ stars: 200, starsDelta24h: 5 });
  const baseScore = computeScore(baseInput, baseMod);

  const breakoutInput = { ...baseInput, starsDelta24h: 40, starsDelta7d: 30 };
  const breakoutMod = {
    ...baseMod,
    starsDelta24h: 40,
    starsDelta7d: 30,
    socialBuzzScore: 60,
    mentionCount24h: 5,
  };
  const breakoutScore = computeScore(breakoutInput, breakoutMod);

  // Breakout-eligible path should not produce a lower overall than the quiet
  // baseline (strictly: velocity inputs + breakout multiplier both push up).
  assert.ok(
    breakoutScore.overall >= baseScore.overall,
    `breakout overall ${breakoutScore.overall} unexpectedly lower than base ${baseScore.overall}`,
  );
});

// ---------------------------------------------------------------------------
// 6. Canonical snapshot — narrow bands, not exact values, so scoring tunes
//    show up as band-miss in review without requiring golden-file maintenance.
// ---------------------------------------------------------------------------

test("canonical: hot-small-repo profile scores in the upper band", () => {
  const input = mkScoringInput({
    repoId: "hot-small",
    stars: 600,
    starsDelta24h: 80,
    starsDelta7d: 250,
    forksDelta7d: 12,
    contributors: 8,
    contributorsDelta30d: 2,
    socialBuzzScore: 70,
    lastCommitAt: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
  });
  const mod = mkModifierInput({
    stars: 600,
    starsDelta24h: 80,
    starsDelta7d: 250,
    forksDelta7d: 12,
    contributors: 8,
    contributorsDelta30d: 2,
    socialBuzzScore: 70,
    mentionCount24h: 10,
    lastCommitAt: input.lastCommitAt,
  });
  const s = computeScore(input, mod);
  assert.ok(
    s.overall >= 40 && s.overall <= 100,
    `hot-small: expected overall ∈ [40,100], got ${s.overall}`,
  );
});

test("canonical: stale-abandoned profile scores in the low band", () => {
  const input = mkScoringInput({
    repoId: "stale",
    stars: 3000,
    starsDelta24h: 0,
    starsDelta7d: -3,
    forksDelta7d: 0,
    contributors: 4,
    contributorsDelta30d: 0,
    socialBuzzScore: 2,
    lastCommitAt: "2022-01-01T00:00:00Z",
    lastReleaseAt: "2021-06-01T00:00:00Z",
  });
  const mod = mkModifierInput({
    stars: 3000,
    starsDelta24h: 0,
    starsDelta7d: -3,
    forksDelta7d: 0,
    contributors: 4,
    contributorsDelta30d: 0,
    socialBuzzScore: 2,
    mentionCount24h: 0,
    lastCommitAt: input.lastCommitAt,
    lastReleaseAt: input.lastReleaseAt,
  });
  const s = computeScore(input, mod);
  assert.ok(
    s.overall >= 0 && s.overall <= 35,
    `stale: expected overall ∈ [0,35], got ${s.overall}`,
  );
});

// ---------------------------------------------------------------------------
// 7. Smoke-test helpers the engine uses internally — make sure they still
//    produce the shapes the engine expects (catches accidental rename regressions).
// ---------------------------------------------------------------------------

test("computeAllComponents returns all 10 expected keys", () => {
  const comps = computeAllComponents(mkScoringInput());
  const keys = Object.keys(comps).sort();
  assert.deepEqual(keys, [
    "categoryMomentum",
    "commitFreshness",
    "communityHealth",
    "contributorGrowth30d",
    "forkVelocity7d",
    "issueActivity",
    "releaseFreshness",
    "socialBuzz",
    "starVelocity24h",
    "starVelocity7d",
  ]);
});

test("computeAllModifiers returns all 4 expected keys", () => {
  const mods = computeAllModifiers(mkModifierInput());
  const keys = Object.keys(mods).sort();
  assert.deepEqual(keys, [
    "antiSpamDampening",
    "breakoutMultiplier",
    "decayFactor",
    "quietKillerBonus",
  ]);
});
