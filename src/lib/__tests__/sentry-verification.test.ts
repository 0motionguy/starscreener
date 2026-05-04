import assert from "node:assert/strict";
import test from "node:test";

import {
  sentryDsnConfigured,
  syntheticEngineError,
  verificationTags,
} from "@/lib/sentry-verification";

test("syntheticEngineError maps kinds to EngineError categories", () => {
  assert.equal(syntheticEngineError("recoverable").category, "recoverable");
  assert.equal(syntheticEngineError("quarantine").category, "quarantine");
  assert.equal(syntheticEngineError("fatal").category, "fatal");
});

test("verificationTags include verification marker and engine tags", () => {
  const tags = verificationTags("quarantine");
  assert.equal(tags.verification, "true");
  assert.equal(tags.verification_kind, "quarantine");
  assert.equal(tags.category, "quarantine");
});

test("sentryDsnConfigured checks both DSN env vars", () => {
  const prevServer = process.env.SENTRY_DSN;
  const prevPublic = process.env.NEXT_PUBLIC_SENTRY_DSN;

  delete process.env.SENTRY_DSN;
  delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  assert.equal(sentryDsnConfigured(), false);

  process.env.SENTRY_DSN = "https://example@sentry.io/123";
  assert.equal(sentryDsnConfigured(), true);

  delete process.env.SENTRY_DSN;
  process.env.NEXT_PUBLIC_SENTRY_DSN = "https://example@sentry.io/456";
  assert.equal(sentryDsnConfigured(), true);

  if (prevServer === undefined) delete process.env.SENTRY_DSN;
  else process.env.SENTRY_DSN = prevServer;

  if (prevPublic === undefined) delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  else process.env.NEXT_PUBLIC_SENTRY_DSN = prevPublic;
});
