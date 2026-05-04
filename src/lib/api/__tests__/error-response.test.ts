// Contract test for the canonical API error envelope.
//
// errorEnvelope() returns { ok:false, error, code? }. The `code`
// field MUST be omitted (not undefined) when no code is passed —
// downstream JSON serialization + type-narrowing relies on absence.
//
// Run with:
//   npx tsx --test src/lib/api/__tests__/error-response.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";

import { errorEnvelope } from "../error-response";

test("errorEnvelope returns {ok:false, error} with no code key when code omitted", () => {
  const env = errorEnvelope("bad thing");
  assert.deepEqual(env, { ok: false, error: "bad thing" });
  assert.equal(Object.prototype.hasOwnProperty.call(env, "code"), false);
  assert.equal(JSON.stringify(env), '{"ok":false,"error":"bad thing"}');
});

test("errorEnvelope includes code when provided", () => {
  const env = errorEnvelope("rate limited", "RATE_LIMITED");
  assert.deepEqual(env, { ok: false, error: "rate limited", code: "RATE_LIMITED" });
  assert.equal(env.code, "RATE_LIMITED");
});

test("errorEnvelope drops code when explicitly undefined", () => {
  const env = errorEnvelope("nope", undefined);
  assert.deepEqual(env, { ok: false, error: "nope" });
  assert.equal(Object.prototype.hasOwnProperty.call(env, "code"), false);
});

test("errorEnvelope preserves ok:false discriminator", () => {
  const env = errorEnvelope("x");
  assert.equal(env.ok, false);
});
