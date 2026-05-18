import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

import { deadLetterLocation } from "@/lib/webhooks/publish";
import {
  __resetNotifyStateForTests,
  type NotifyResult,
} from "@/lib/notify";

const TMP_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "ss-webhook-digest-"));
const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  CRON_SECRET: process.env.CRON_SECRET,
  TRENDINGREPO_DATA_DIR: process.env.TRENDINGREPO_DATA_DIR,
  STARSCREENER_DATA_DIR: process.env.STARSCREENER_DATA_DIR,
  SLACK_WEBHOOK_CUSTOMER_OPS: process.env.SLACK_WEBHOOK_CUSTOMER_OPS,
  SLACK_WEBHOOK_OPS: process.env.SLACK_WEBHOOK_OPS,
  SLACK_WEBHOOK_DEFAULT: process.env.SLACK_WEBHOOK_DEFAULT,
};
const ORIGINAL_FETCH = globalThis.fetch;

function restoreEnv(): void {
  for (const key of Object.keys(ORIGINAL_ENV) as Array<keyof typeof ORIGINAL_ENV>) {
    const value = ORIGINAL_ENV[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      (process.env as Record<string, string | undefined>)[key] = value;
    }
  }
  globalThis.fetch = ORIGINAL_FETCH;
  __resetNotifyStateForTests();
}

function configureTestEnv(): void {
  restoreEnv();
  (process.env as Record<string, string>).NODE_ENV = "production";
  process.env.CRON_SECRET = "cron-test-secret";
  process.env.TRENDINGREPO_DATA_DIR = TMP_DATA_DIR;
  delete process.env.STARSCREENER_DATA_DIR;
}

function authorizedRequest(): NextRequest {
  return new NextRequest("https://trendingrepo.com/api/cron/webhooks/dead-letter-digest", {
    method: "GET",
    headers: { authorization: "Bearer cron-test-secret" },
  });
}

async function invokeDigest(): Promise<{
  status: number;
  body: Record<string, unknown> & { notify?: NotifyResult };
}> {
  const { GET } = await import("@/app/api/cron/webhooks/dead-letter-digest/route");
  const res = await GET(authorizedRequest());
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

test.beforeEach(() => {
  rmSync(TMP_DATA_DIR, { recursive: true, force: true });
  configureTestEnv();
});

test.after(() => {
  rmSync(TMP_DATA_DIR, { recursive: true, force: true });
  restoreEnv();
});

test("dead-letter digest uses data-dir aware path and treats missing file as empty", async () => {
  const { status, body } = await invokeDigest();

  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.recent, 0);
  assert.equal(body.total, 0);
  assert.equal(deadLetterLocation(), path.join(TMP_DATA_DIR, "webhook-dead-letter.jsonl"));
});

test("dead-letter digest aggregates real WebhookDelivery rows and skips malformed lines", async () => {
  process.env.SLACK_WEBHOOK_CUSTOMER_OPS = "https://hooks.slack.com/services/customer";
  let postedBody = "";
  globalThis.fetch = async (_url, init) => {
    postedBody = String(init?.body ?? "");
    return new Response("ok", { status: 200 });
  };

  const now = new Date().toISOString();
  const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const rows = [
    {
      id: "breakout:vercel/next.js:slack-main",
      dedupKey: "breakout:vercel/next.js:slack-main",
      targetId: "slack-main",
      provider: "slack",
      event: "breakout",
      payload: { fullName: "vercel/next.js" },
      createdAt: now,
      attempts: 5,
      lastError: "HTTP 500",
      deadLetter: true,
    },
    "{malformed",
    {
      id: "funding:round-1:discord-main",
      dedupKey: "funding:round-1:discord-main",
      targetId: "discord-main",
      provider: "discord",
      event: "funding",
      payload: { id: "round-1", headline: "Seed" },
      createdAt: now,
      attempts: 6,
      lastError: "timeout",
      deadLetter: true,
    },
    {
      id: "breakout:old:slack-main",
      dedupKey: "breakout:old:slack-main",
      targetId: "slack-main",
      provider: "slack",
      event: "breakout",
      payload: { fullName: "old/repo" },
      createdAt: old,
      attempts: 5,
      lastError: "old",
      deadLetter: true,
    },
  ];
  mkdirSync(TMP_DATA_DIR, { recursive: true });
  writeFileSync(
    deadLetterLocation(),
    rows.map((row) => (typeof row === "string" ? row : JSON.stringify(row))).join("\n") + "\n",
    "utf8",
  );

  const { status, body } = await invokeDigest();

  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.recent, 2);
  assert.equal(body.total, 3);
  assert.deepEqual(body.byEvent, { breakout: 1, funding: 1 });
  assert.deepEqual(body.byTarget, {
    "slack:slack-main": 1,
    "discord:discord-main": 1,
  });
  assert.deepEqual(body.notify, { delivered: true, reason: null });
  assert.match(postedBody, /2 end-user webhook delivery failures/);
  assert.match(postedBody, /slack-main/);
  assert.match(postedBody, /discord-main/);
  assert.doesNotMatch(postedBody, /hooks\.slack\.com/);
});

test("dead-letter digest awaits notify and returns delivery failure reason", async () => {
  process.env.SLACK_WEBHOOK_CUSTOMER_OPS = "https://hooks.slack.com/services/customer";
  globalThis.fetch = async () => new Response("nope", { status: 500 });

  mkdirSync(TMP_DATA_DIR, { recursive: true });
  writeFileSync(
    deadLetterLocation(),
    JSON.stringify({
      id: "breakout:vercel/next.js:slack-main",
      dedupKey: "breakout:vercel/next.js:slack-main",
      targetId: "slack-main",
      provider: "slack",
      event: "breakout",
      payload: { fullName: "vercel/next.js" },
      createdAt: new Date().toISOString(),
      attempts: 5,
      lastError: "HTTP 500",
      deadLetter: true,
    }) + "\n",
    "utf8",
  );

  const { status, body } = await invokeDigest();

  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.recent, 1);
  assert.deepEqual(body.notify, {
    delivered: false,
    reason: "post_failed",
  });
});
