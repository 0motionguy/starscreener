// Vitest tests for src/lib/seo.ts.
//
// Coverage gap: `safeJsonLd` (added in 9722a43) had zero direct tests
// — it is the single defense-in-depth helper that ships into seven
// `<script type="application/ld+json">` blobs across the metadata
// surface. A regression here is silent + XSS-shaped, so it gets hard
// pinned tests.
//
// File lives in `src/lib/__vitest__/`, NOT `src/lib/__tests__/`, so
// the `npm test` glob (`tsx --test src/lib/__tests__/*.test.ts`)
// doesn't see it. Vitest's include array opts this directory in
// explicitly via `vitest.config.ts`. No runner overlap.

import { describe, expect, it } from "vitest";

import { safeJsonLd } from "../seo";

describe("safeJsonLd", () => {
  it("escapes the literal </script> sequence so it cannot break out of a <script> tag", () => {
    const out = safeJsonLd({ a: "</script>" });
    // The escaped form must be present, and the raw closing tag must
    // not appear anywhere in the output.
    expect(out).toContain("\\u003c/script\\u003e");
    expect(out).not.toContain("</script>");
  });

  it("escapes ampersands to \\u0026", () => {
    const out = safeJsonLd({ a: "x&y" });
    expect(out).toContain("\\u0026");
    // Raw '&' must not appear in the rendered string.
    expect(out).not.toMatch(/&/);
  });

  it("escapes U+2028 (line separator) so legacy JS parsers don't choke", () => {
    // Build the input via fromCharCode so the raw U+2028 byte is
    // never present in this source file — some IDE/CI tools strip it
    // silently when stored as a literal in TS sources.
    const ls = String.fromCharCode(0x2028);
    const out = safeJsonLd({ a: `x${ls}y` });
    expect(out).toContain("\\u2028");
    // The raw line separator must NOT survive in the output.
    expect(out).not.toContain(ls);
  });

  it("escapes U+2029 (paragraph separator)", () => {
    const ps = String.fromCharCode(0x2029);
    const out = safeJsonLd({ a: `x${ps}y` });
    expect(out).toContain("\\u2029");
    expect(out).not.toContain(ps);
  });

  it("produces JSON parseable by JSON.parse for an empty object", () => {
    const out = safeJsonLd({});
    // Empty object — no < > & U+2028/U+2029 to un-escape, so the raw
    // output is itself valid JSON.
    expect(JSON.parse(out)).toEqual({});
  });

  it("round-trips arbitrary safe object values when un-escaped", () => {
    const obj = { name: "TrendingRepo", count: 7, tags: ["x", "y"] };
    const out = safeJsonLd(obj);
    // After un-escaping the four sequences, the result must be valid
    // JSON and equal the input.
    const ls = String.fromCharCode(0x2028);
    const ps = String.fromCharCode(0x2029);
    const restored = out
      .replace(/\\u003c/g, "<")
      .replace(/\\u003e/g, ">")
      .replace(/\\u0026/g, "&")
      .replace(/\\u2028/g, ls)
      .replace(/\\u2029/g, ps);
    expect(JSON.parse(restored)).toEqual(obj);
  });
});
