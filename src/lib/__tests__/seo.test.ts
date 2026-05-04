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
