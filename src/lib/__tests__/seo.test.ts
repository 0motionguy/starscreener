import assert from "node:assert/strict";
import { test } from "node:test";

import { safeJsonLd } from "../seo";

test("safeJsonLd escapes < > & in top-level string values", () => {
  const out = safeJsonLd({ x: "</script><img src=x onerror=alert(1)> & co" });
  assert.ok(!out.includes("<"), "raw < must not appear");
  assert.ok(!out.includes(">"), "raw > must not appear");
  assert.ok(!/&(?!#|amp;|lt;|gt;|quot;|apos;)/.test(out.replace(/\\u0026/g, "")),
    "raw & must be escaped to \\u0026");
  assert.match(out, /\\u003c/);
  assert.match(out, /\\u003e/);
  assert.match(out, /\\u0026/);
});

test("safeJsonLd escapes < > & inside nested objects and arrays", () => {
  const payload = {
    name: "ok",
    nested: {
      deeper: {
        bad: "<script>alert('x')</script>",
        amp: "a & b",
      },
      list: [
        "</script>",
        { evil: "<svg/onload=1>" },
        ["a > b", "c & d"],
      ],
    },
  };

  const out = safeJsonLd(payload);
  // After escaping, no raw <, >, or & should remain anywhere in the output.
  assert.ok(!out.includes("<"), "no raw < in nested output");
  assert.ok(!out.includes(">"), "no raw > in nested output");
  assert.ok(!out.includes("&") || /\\u0026/.test(out),
    "& only allowed as part of \\u0026 escape");
  // Strip escapes and confirm the unescaped form contained the markers.
  assert.match(out, /\\u003cscript\\u003e/);
  assert.match(out, /\\u003c\/script\\u003e/);
  assert.match(out, /a \\u0026 b/);
});

test("safeJsonLd escapes U+2028 and U+2029 line/paragraph separators", () => {
  const payload = {
    line: `before\u2028after`,
    paragraph: `before\u2029after`,
    nested: {
      both: `\u2028middle\u2029end`,
    },
  };

  const out = safeJsonLd(payload);
  assert.ok(!out.includes("\u2028"), "raw U+2028 must not survive");
  assert.ok(!out.includes("\u2029"), "raw U+2029 must not survive");
  assert.match(out, /\\u2028/);
  assert.match(out, /\\u2029/);
  // Both occurrences in `nested.both` must be escaped, not just the first.
  const u2028Hits = (out.match(/\\u2028/g) ?? []).length;
  const u2029Hits = (out.match(/\\u2029/g) ?? []).length;
  assert.equal(u2028Hits, 2, "every U+2028 instance escaped");
  assert.equal(u2029Hits, 2, "every U+2029 instance escaped");
});

test("safeJsonLd round-trips back to the original value via JSON.parse", () => {
  const payload = {
    xss: "</script><b>&\u2028\u2029</b>",
    nested: { deep: ["<", ">", "&", "\u2028", "\u2029"] },
  };
  const out = safeJsonLd(payload);
  // JSON.parse interprets \uXXXX escapes — the round-trip should equal input.
  assert.deepEqual(JSON.parse(out), payload);
});

test("safeJsonLd does not allow script-tag breakout when embedded in HTML", () => {
  const payload = {
    dangerous: '</script><img src=x onerror="globalThis.__xss = 1">',
    alsoDangerous: "<ScRiPt>alert(1)</ScRiPt>",
  };

  const html = `<script type="application/ld+json">${safeJsonLd(payload)}</script>`;
  const closeScriptMatches = html.match(/<\/script>/gi) ?? [];

  // The wrapper close tag should be the only real </script> in the emitted HTML.
  assert.equal(closeScriptMatches.length, 1);
  // Injection markers must remain encoded and never become active tags.
  assert.ok(!html.includes("<img"), "payload must not create a live <img> tag");
  assert.ok(!/<script>/i.test(html.slice(0, -9)), "payload must not create nested <script> tags");
  assert.match(html, /\\u003c\/script\\u003e/i);
});

test("safeJsonLd XSS escape matrix covers common script-breakout payloads", () => {
  const vectors = [
    "</script><script>alert(1)</script>",
    "</script><img src=x onerror=alert(1)>",
    "<svg/onload=alert(1)>",
    "<ScRiPt>alert(String.fromCharCode(88,83,83))</sCrIpT>",
    "javascript:alert(1) & </script>",
  ];

  for (const vector of vectors) {
    const html = `<script type="application/ld+json">${safeJsonLd({ vector })}</script>`;
    const closeScriptMatches = html.match(/<\/script>/gi) ?? [];
    assert.equal(
      closeScriptMatches.length,
      1,
      `wrapper close tag must be unique for vector: ${vector}`,
    );
    assert.ok(!html.includes("<img"), `no live <img> tag for vector: ${vector}`);
    assert.ok(!/<script>/i.test(html.slice(0, -9)), `no nested <script> tag for vector: ${vector}`);
    assert.ok(!html.includes("</script><"), `no script breakout sequence for vector: ${vector}`);
    assert.match(html, /\\u003c/, `vector must include escaped < token: ${vector}`);
    assert.match(html, /\\u003e/, `vector must include escaped > token: ${vector}`);
  }
});
