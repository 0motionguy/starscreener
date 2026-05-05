import assert from "node:assert/strict";
import test from "node:test";

import { EngineError, engineErrorSentryContext } from "../errors";

class TestEngineError extends EngineError {
  readonly category = "quarantine" as const;
  readonly source = "auth" as const;
}

test("engineErrorSentryContext sanitizes token-like metadata before Sentry extras", () => {
  const err = new TestEngineError("auth failure", {
    authorization: "Bearer abcdefghijklmnop",
    token: "abcdefghijklmnopqrstuvwxyz",
    nested: {
      cookie: "ss_admin=zyxwvutsrqponmlk",
    },
  });

  const context = engineErrorSentryContext(err);
  const metadata = context.extra.engine_error_metadata as
    | Record<string, unknown>
    | undefined;

  assert.ok(metadata, "expected engine_error_metadata");
  const authorization = String(metadata?.authorization ?? "");
  const token = String(metadata?.token ?? "");
  const nested = metadata?.nested as Record<string, unknown> | undefined;
  const cookie = String(nested?.cookie ?? "");

  assert.equal(authorization.includes("abcdefghijklmnop"), false);
  assert.equal(token.includes("abcdefghijklmnopqrstuvwxyz"), false);
  assert.equal(cookie.includes("zyxwvutsrqponmlk"), false);
  assert.match(authorization, /Bearer\s+abcd\*\*\*\*mnop/);
  assert.match(token, /abcd\*\*\*\*wxyz/);
  assert.match(cookie, /ss_admin=zyxw\*\*\*\*nmlk/);
});
