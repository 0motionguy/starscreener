import { test } from "node:test";
import assert from "node:assert/strict";

import {
  __resetNotifyStateForTests,
  notify,
} from "@/lib/notify";

const ORIGINAL_ENV = {
  SLACK_WEBHOOK_DEFAULT: process.env.SLACK_WEBHOOK_DEFAULT,
  SLACK_WEBHOOK_OPS: process.env.SLACK_WEBHOOK_OPS,
  SLACK_WEBHOOK_CUSTOMER_OPS: process.env.SLACK_WEBHOOK_CUSTOMER_OPS,
  SLACK_WEBHOOK_SIGNALS: process.env.SLACK_WEBHOOK_SIGNALS,
  SLACK_WEBHOOK_CRITICAL: process.env.SLACK_WEBHOOK_CRITICAL,
  SLACK_RATE_LIMIT_PER_SOURCE: process.env.SLACK_RATE_LIMIT_PER_SOURCE,
  SLACK_RATE_LIMIT_WINDOW_SECONDS: process.env.SLACK_RATE_LIMIT_WINDOW_SECONDS,
  SLACK_QUIET_HOURS_RANGE: process.env.SLACK_QUIET_HOURS_RANGE,
};

const ORIGINAL_FETCH = globalThis.fetch;

function resetEnv(): void {
  for (const key of Object.keys(ORIGINAL_ENV) as Array<keyof typeof ORIGINAL_ENV>) {
    const value = ORIGINAL_ENV[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  globalThis.fetch = ORIGINAL_FETCH;
  __resetNotifyStateForTests();
}

test.beforeEach(() => {
  resetEnv();
});

test.after(() => {
  resetEnv();
});

test("notify returns no_webhook_configured when no Slack webhook env is set", async () => {
  delete process.env.SLACK_WEBHOOK_DEFAULT;
  delete process.env.SLACK_WEBHOOK_OPS;

  const result = await notify({
    severity: "ops",
    source: "test.notify.no-webhook",
    title: "No webhook",
    message: "Nothing should be posted",
  });

  assert.deepEqual(result, {
    delivered: false,
    reason: "no_webhook_configured",
  });
});

test("notify posts to customer ops webhook and masks secret-looking context", async () => {
  process.env.SLACK_WEBHOOK_CUSTOMER_OPS = "https://hooks.slack.com/services/customer";
  process.env.SLACK_WEBHOOK_DEFAULT = "https://hooks.slack.com/services/default";

  let postedUrl = "";
  let postedBody = "";
  globalThis.fetch = async (url, init) => {
    postedUrl = String(url);
    postedBody = String(init?.body ?? "");
    return new Response("ok", { status: 200 });
  };

  const result = await notify({
    severity: "ops",
    audience: "customer",
    source: "test.notify.customer",
    title: "Customer event",
    message: "A customer-facing ops event fired",
    context: {
      maskedValue: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1234",
      nested: { callback: "https://hooks.slack.com/services/T000/B000/SECRET" },
    },
  });

  assert.deepEqual(result, { delivered: true, reason: null });
  assert.equal(postedUrl, "https://hooks.slack.com/services/customer");
  assert.match(postedBody, /aaaa.*1234/);
  assert.doesNotMatch(postedBody, /aaaaaaaaaaaaaaaaaaaaaaaa/);
  assert.doesNotMatch(postedBody, /T000\/B000\/SECRET/);
});

test("notify dedupes repeated idempotency keys before posting", async () => {
  process.env.SLACK_WEBHOOK_OPS = "https://hooks.slack.com/services/ops";
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("ok", { status: 200 });
  };

  const args = {
    severity: "ops" as const,
    source: "test.notify.dedupe",
    title: "Deduped",
    message: "Only posts once",
    idempotencyKey: "dedupe-key",
  };

  assert.deepEqual(await notify(args), { delivered: true, reason: null });
  assert.deepEqual(await notify(args), {
    delivered: false,
    reason: "deduped",
  });
  assert.equal(calls, 1);
});

test("notify applies per-source ops rate limiting", async () => {
  process.env.SLACK_WEBHOOK_OPS = "https://hooks.slack.com/services/ops";
  process.env.SLACK_RATE_LIMIT_PER_SOURCE = "1";
  process.env.SLACK_RATE_LIMIT_WINDOW_SECONDS = "600";
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("ok", { status: 200 });
  };

  const first = await notify({
    severity: "ops",
    source: "test.notify.rate",
    title: "First",
    message: "Allowed",
  });
  const second = await notify({
    severity: "ops",
    source: "test.notify.rate",
    title: "Second",
    message: "Blocked",
  });

  assert.deepEqual(first, { delivered: true, reason: null });
  assert.deepEqual(second, { delivered: false, reason: "rate_limited" });
  assert.equal(calls, 1);
});

test("notify reports abort errors as post_timeout", async () => {
  process.env.SLACK_WEBHOOK_OPS = "https://hooks.slack.com/services/ops";
  globalThis.fetch = async () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  };

  const result = await notify({
    severity: "ops",
    source: "test.notify.timeout",
    title: "Timeout",
    message: "Fetch aborted",
  });

  assert.deepEqual(result, { delivered: false, reason: "post_timeout" });
});
