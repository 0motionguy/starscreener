import { test } from "node:test";
import assert from "node:assert/strict";

import { withHealthcheck } from "@/lib/healthcheck";

const ORIGINAL_ENV = {
  CRON_SECRET: process.env.CRON_SECRET,
  HEALTHCHECK_WEBHOOKS_TEST: process.env.HEALTHCHECK_WEBHOOKS_TEST,
};
const ORIGINAL_FETCH = globalThis.fetch;

function restoreEnv(): void {
  for (const key of Object.keys(ORIGINAL_ENV) as Array<keyof typeof ORIGINAL_ENV>) {
    const value = ORIGINAL_ENV[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  globalThis.fetch = ORIGINAL_FETCH;
}

function request(auth = "Bearer cron-secret"): Request {
  return new Request("https://trendingrepo.com/api/cron/webhooks/test", {
    headers: { authorization: auth },
  });
}

test.beforeEach(() => {
  restoreEnv();
  process.env.CRON_SECRET = "cron-secret";
  process.env.HEALTHCHECK_WEBHOOKS_TEST = "https://hc-ping.com/check-id";
});

test.after(() => {
  restoreEnv();
});

test("withHealthcheck pings start and success for authorized successful runs", async () => {
  const calls: Array<{ url: string; body: string }> = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: String(init?.body ?? "") });
    return new Response("ok", { status: 200 });
  };

  const handler = withHealthcheck("webhooks-test", async () => Response.json({ ok: true }));
  const res = await handler(request());

  assert.equal(res.status, 200);
  assert.deepEqual(calls, [
    { url: "https://hc-ping.com/check-id/start", body: "" },
    { url: "https://hc-ping.com/check-id", body: "Route webhooks-test returned 200" },
  ]);
});

test("withHealthcheck pings failure for authorized non-ok responses", async () => {
  const calls: Array<{ url: string; body: string }> = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: String(init?.body ?? "") });
    return new Response("ok", { status: 200 });
  };

  const handler = withHealthcheck("webhooks-test", async () => new Response("no", { status: 500 }));
  const res = await handler(request());

  assert.equal(res.status, 500);
  assert.deepEqual(calls, [
    { url: "https://hc-ping.com/check-id/start", body: "" },
    { url: "https://hc-ping.com/check-id/fail", body: "Route webhooks-test returned 500" },
  ]);
});

test("withHealthcheck skips pings for unauthorized cron probes", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("ok", { status: 200 });
  };

  const handler = withHealthcheck("webhooks-test", async () => new Response("no", { status: 401 }));
  const res = await handler(request("Bearer wrong-secret"));

  assert.equal(res.status, 401);
  assert.equal(calls, 0);
});

test("withHealthcheck reports thrown handler failures without swallowing the error", async () => {
  const calls: Array<{ url: string; body: string }> = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: String(init?.body ?? "") });
    return new Response("ok", { status: 200 });
  };

  const handler = withHealthcheck("webhooks-test", async () => {
    throw new Error("boom");
  });

  await assert.rejects(() => handler(request()), /boom/);
  assert.deepEqual(calls, [
    { url: "https://hc-ping.com/check-id/start", body: "" },
    { url: "https://hc-ping.com/check-id/fail", body: "boom" },
  ]);
});
