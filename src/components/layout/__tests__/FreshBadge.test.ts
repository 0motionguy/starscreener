// Vitest tests for the pure helpers exported by FreshBadge.tsx.
//
// The component itself is a "use client" React component that polls
// /api/health on mount. We do not exercise the polling here — only the
// three pure helpers (`normalizeHealth`, `readAge`, `formatAge`) that
// drive every render path. The /api/health?soft=1 case (where
// `ageSeconds` is missing entirely) is the one explicitly flagged by
// the code-reviewer for zero coverage.

import { describe, expect, it } from "vitest";

import { normalizeHealth, readAge, formatAge } from "../FreshBadge";

describe("normalizeHealth", () => {
  it("returns status='error' and undefined ageSeconds for an empty object", () => {
    const snap = normalizeHealth({});
    expect(snap.status).toBe("error");
    expect(snap.ageSeconds).toBeUndefined();
  });

  it("returns the supplied status when ageSeconds is missing (soft=1 shape)", () => {
    const snap = normalizeHealth({ status: "ok" });
    expect(snap.status).toBe("ok");
    // APP-12: /api/health?soft=1 strips ageSeconds, so it should remain
    // undefined here — readAge() must cope downstream.
    expect(snap.ageSeconds).toBeUndefined();
  });

  it("preserves a known scraper age and nulls out missing fields", () => {
    const snap = normalizeHealth({
      status: "ok",
      ageSeconds: { scraper: 60 },
    });
    expect(snap.status).toBe("ok");
    expect(snap.ageSeconds).toBeDefined();
    expect(snap.ageSeconds?.scraper).toBe(60);
    expect(snap.ageSeconds?.deltas).toBeNull();
    expect(snap.ageSeconds?.reddit).toBeNull();
    expect(snap.ageSeconds?.bluesky).toBeNull();
    expect(snap.ageSeconds?.hn).toBeNull();
    expect(snap.ageSeconds?.producthunt).toBeNull();
    expect(snap.ageSeconds?.devto).toBeNull();
    expect(snap.ageSeconds?.lobsters).toBeNull();
  });

  it('falls back to "error" for an unknown status string', () => {
    const snap = normalizeHealth({ status: "weird" });
    expect(snap.status).toBe("error");
  });

  it("ignores ageSeconds when not an object (defensive coercion)", () => {
    // A non-object ageSeconds (e.g. JSON.parse oddity) must not crash —
    // we drop the field and return undefined.
    const snap = normalizeHealth({ status: "ok", ageSeconds: 42 });
    expect(snap.ageSeconds).toBeUndefined();
  });

  it("coerces non-number per-source values to null", () => {
    const snap = normalizeHealth({
      status: "stale",
      ageSeconds: { scraper: 60, reddit: "garbage", hn: null },
    });
    expect(snap.ageSeconds?.scraper).toBe(60);
    expect(snap.ageSeconds?.reddit).toBeNull();
    expect(snap.ageSeconds?.hn).toBeNull();
  });
});

describe("readAge", () => {
  it("returns null when the snapshot has no ageSeconds (soft=1 case)", () => {
    const snap = normalizeHealth({ status: "ok" });
    expect(readAge(snap, "scraper")).toBeNull();
    expect(readAge(snap, "reddit")).toBeNull();
  });

  it("returns the per-key value when ageSeconds is present", () => {
    const snap = normalizeHealth({
      status: "ok",
      ageSeconds: { scraper: 60, reddit: 120 },
    });
    expect(readAge(snap, "scraper")).toBe(60);
    expect(readAge(snap, "reddit")).toBe(120);
    expect(readAge(snap, "hn")).toBeNull();
  });
});

describe("formatAge", () => {
  it('returns "—" for null', () => {
    expect(formatAge(null)).toBe("—");
  });

  it('returns "—" for NaN', () => {
    expect(formatAge(Number.NaN)).toBe("—");
  });

  it('returns "—" for Infinity', () => {
    expect(formatAge(Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatAge(Number.NEGATIVE_INFINITY)).toBe("—");
  });

  it('returns "live" for any value < 60s', () => {
    expect(formatAge(0)).toBe("live");
    expect(formatAge(1)).toBe("live");
    expect(formatAge(59)).toBe("live");
  });

  it("returns minutes for 60s ≤ s < 3600s", () => {
    expect(formatAge(60)).toBe("1m");
    expect(formatAge(119)).toBe("1m");
    expect(formatAge(120)).toBe("2m");
    expect(formatAge(3599)).toBe("59m");
  });

  it("returns hours for 3600s ≤ s < 86400s", () => {
    expect(formatAge(3600)).toBe("1h");
    expect(formatAge(7199)).toBe("1h");
    expect(formatAge(7200)).toBe("2h");
    expect(formatAge(86399)).toBe("23h");
  });

  it("returns days for s ≥ 86400s", () => {
    expect(formatAge(86400)).toBe("1d");
    expect(formatAge(172800)).toBe("2d");
    expect(formatAge(7 * 86400)).toBe("7d");
  });
});
