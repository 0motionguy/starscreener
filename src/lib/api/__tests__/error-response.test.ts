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

import {
  __resetErrorResponseSentryCaptureForTests,
  __setErrorResponseSentryCaptureForTests,
  errorEnvelope,
  serverError,
} from "../error-response";
import { AdminFatalError } from "@/lib/errors";

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

test("serverError forwards EngineError source/category tags to Sentry", async () => {
  const calls: Array<{ error: unknown; context: unknown }> = [];
  __setErrorResponseSentryCaptureForTests(((
    error: unknown,
    context?: unknown,
  ) => {
    calls.push({ error, context: context ?? null });
    return "evt-server-error";
  }) as Parameters<typeof __setErrorResponseSentryCaptureForTests>[0]);

  try {
    const err = new AdminFatalError("fatal admin path", { scope: "test" });
    const response = serverError(err, { scope: "[test:serverError]" });
    assert.equal(response.status, 500);
    assert.equal(calls.length, 1);
    const tags = (calls[0].context as { tags?: Record<string, string> } | null)?.tags;
    assert.equal(tags?.source, "admin");
    assert.equal(tags?.category, "fatal");
    assert.equal(tags?.scope, "[test:serverError]");
  } finally {
    __resetErrorResponseSentryCaptureForTests();
  }
});
