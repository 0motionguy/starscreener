// Vitest tests for src/lib/trending-score.ts.
//
// File lives in `src/lib/__vitest__/`, NOT `src/lib/__tests__/`. The
// `npm test` glob (`tsx --test src/lib/__tests__/*.test.ts`) globs the
// node:test directory, and a vitest file there crashes the suite ("Vitest
// failed to access its internal state"). Vitest's include array opts
// `__vitest__/` in via `vitest.config.ts`. No runner overlap.
//
// Run: `npx vitest run src/lib/__vitest__/trending-score.test.ts`
// or `npm run test:hooks` (covers all vitest suites).

import { describe, expect, it } from "vitest";

import { hnGravityScore, redditHotScore } from "../trending-score";

describe("redditHotScore", () => {
  it("with score=0 returns time-only ordering", () => {
    // The formula reduces to `(epoch - 1134028003) / 45000` when score=0.
    // For createdUtc = 1134028003 we expect exactly 0.
    expect(redditHotScore({ score: 0, createdUtc: 1134028003 })).toBe(0);
  });

  it("with score=0, two posts at different createdUtc produce strictly different scores", () => {
    const earlier = redditHotScore({ score: 0, createdUtc: 1700000000 });
    const later = redditHotScore({ score: 0, createdUtc: 1700001000 });
    expect(earlier).not.toBe(later);
    // Later posts must rank higher in chronological-only mode.
    expect(later).toBeGreaterThan(earlier);
  });

  it("higher positive score outranks lower at the same createdUtc", () => {
    const t = 1700000000;
    const small = redditHotScore({ score: 1, createdUtc: t });
    const big = redditHotScore({ score: 1000, createdUtc: t });
    expect(big).toBeGreaterThan(small);
  });

  it("score=1 at the epoch anchor returns the expected log10(1)=0 + time term", () => {
    // log10(max(|1|, 1)) = 0; sign=1; seconds=0 → returns 0
    expect(redditHotScore({ score: 1, createdUtc: 1134028003 })).toBe(0);
  });

  it("handles negative scores via sign flip — controversial post ranks below a fresh-zero post", () => {
    const t = 1700000000;
    const negative = redditHotScore({ score: -100, createdUtc: t });
    const zero = redditHotScore({ score: 0, createdUtc: t });
    // Negative-score post: sign=-1, order=log10(100)=2, contribution -2.
    // Zero-score post: sign=0, contribution 0.
    // Same time term cancels, so negative < zero by ~2.
    expect(negative).toBeLessThan(zero);
    expect(zero - negative).toBeCloseTo(2, 6);
  });

  it("is a pure function — same input always returns same output", () => {
    const args = { score: 42, createdUtc: 1700000000 };
    const a = redditHotScore(args);
    const b = redditHotScore(args);
    const c = redditHotScore({ ...args });
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it("rounds to 7 decimal places for stable serialization", () => {
    // The `Math.round(... * 1e7) / 1e7` clamp means no value should have
    // more than 7 digits after the decimal point.
    const result = redditHotScore({ score: 137, createdUtc: 1700000123 });
    const decimals = result.toString().split(".")[1] ?? "";
    expect(decimals.length).toBeLessThanOrEqual(7);
  });
});

describe("hnGravityScore", () => {
  it("matches HN's published default gravity of 1.8", () => {
    // (P-1)/(T+2)^1.8 with P=10, T=1 → 9 / 3^1.8 ≈ 9 / 7.224 ≈ 1.2459
    const result = hnGravityScore({ score: 10, ageHours: 1 });
    expect(result).toBeCloseTo(9 / Math.pow(3, 1.8), 6);
  });

  it("respects custom gravity overrides", () => {
    const default18 = hnGravityScore({ score: 10, ageHours: 1 });
    const heavy30 = hnGravityScore({ score: 10, ageHours: 1, gravity: 3 });
    // Higher gravity decays faster → lower score for the same input.
    expect(heavy30).toBeLessThan(default18);
  });

  it("goes negative when score=0 (the documented footgun)", () => {
    // (0-1)/(T+2)^1.8 = -1/positive → negative. This is exactly why the
    // Reddit-hot formula is preferred for our pipeline.
    expect(hnGravityScore({ score: 0, ageHours: 1 })).toBeLessThan(0);
  });

  it("is a pure function — same input always returns same output", () => {
    const args = { score: 42, ageHours: 3, gravity: 1.8 };
    expect(hnGravityScore(args)).toBe(hnGravityScore(args));
  });
});
