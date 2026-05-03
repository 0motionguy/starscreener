import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { TwitterAllSourcesFailedError } from "../errors";
import { _resetNitterPoolForTests } from "../pool/nitter-twitter";
import {
  _resetTwitterFallbackSentryForTests,
  _setTwitterFallbackSentryForTests,
  scrapeTwitterFor,
} from "../pool/twitter-fallback";
import { _setRedisForTests } from "../redis";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_WEBHOOK = process.env.OPS_ALERT_WEBHOOK;

afterEach(() => {
  _setRedisForTests(null);
  _resetNitterPoolForTests();
  _resetTwitterFallbackSentryForTests();
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_WEBHOOK === undefined) {
    delete process.env.OPS_ALERT_WEBHOOK;
  } else {
    process.env.OPS_ALERT_WEBHOOK = ORIGINAL_WEBHOOK;
  }
});

test("scrapeTwitterFor falls back to nitter when apify fails and records degraded sentry tag", async () => {
  const sentryMessages: Array<{ message: string; context: unknown }> = [];
  _setTwitterFallbackSentryForTests({
    captureMessage: ((message: string, context?: unknown) => {
      sentryMessages.push({ message, context });
      return "evt-msg";
    }) as never,
    captureException: (() => "evt-exc") as never,
  });

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/search/rss")) {
      return new Response(
        `
        <rss><channel>
          <item>
            <title><![CDATA[alpha/repo just shipped]]></title>
            <link>https://nitter.net/dev/status/123</link>
            <pubDate>Sun, 03 May 2026 13:00:00 GMT</pubDate>
            <dc:creator>@dev</dc:creator>
          </item>
        </channel></rss>
        `,
        { status: 200, headers: { "content-type": "application/rss+xml" } },
      );
    }
    return new Response("not-found", { status: 404 });
  }) as typeof fetch;

  const failingProvider = {
    async search(): Promise<never> {
      throw new Error("HTTP 401 from apify");
    },
  };

  const signals = await scrapeTwitterFor("alpha/repo", {
    provider: failingProvider as never,
    limit: 25,
  });

  assert.equal(signals.length, 1);
  assert.equal(signals[0].authorHandle, "dev");
  assert.equal(signals[0].url.includes("x.com"), true);

  const degraded = sentryMessages.find((entry) =>
    entry.message.includes("twitter source degraded"),
  );
  assert.ok(degraded, "expected degraded Sentry message");
  const tags = (degraded?.context as { tags?: Record<string, string> } | undefined)?.tags;
  assert.equal(tags?.alert, "twitter-degraded");
});

test("scrapeTwitterFor throws TwitterAllSourcesFailedError and posts OPS alert when all sources fail", async () => {
  const sentryExceptions: unknown[] = [];
  _setTwitterFallbackSentryForTests({
    captureMessage: (() => "evt-msg") as never,
    captureException: ((error: unknown) => {
      sentryExceptions.push(error);
      return "evt-exc";
    }) as never,
  });

  const webhookCalls: Array<{ url: string; body: string }> = [];
  process.env.OPS_ALERT_WEBHOOK = "https://ops.example/webhook";

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === process.env.OPS_ALERT_WEBHOOK) {
      webhookCalls.push({
        url,
        body: String(init?.body ?? ""),
      });
      return new Response("ok", { status: 200 });
    }
    if (url.includes("/search/rss")) {
      return new Response("down", { status: 503 });
    }
    return new Response("not-found", { status: 404 });
  }) as typeof fetch;

  const failingProvider = {
    async search(): Promise<never> {
      throw new Error("HTTP 401 from apify");
    },
  };

  await assert.rejects(
    () =>
      scrapeTwitterFor("beta/repo", {
        provider: failingProvider as never,
        limit: 25,
      }),
    (error: unknown) => {
      assert.ok(error instanceof TwitterAllSourcesFailedError);
      return true;
    },
  );

  assert.equal(webhookCalls.length, 1, "expected one OPS alert webhook post");
  assert.match(webhookCalls[0].body, /twitter-all-sources-failed/);
  assert.equal(sentryExceptions.length > 0, true, "expected fatal Sentry exception");
});
