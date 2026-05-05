import assert from "node:assert/strict";
import test from "node:test";

import {
  _alertOpsForTests,
  _resetSubdomainTakeoverSentryForTests,
  _setSubdomainTakeoverSentryForTests,
} from "@/lib/security/subdomain-takeover";

const ORIGINAL_WEBHOOK = process.env.OPS_ALERT_WEBHOOK;
const ORIGINAL_FETCH = globalThis.fetch;

test("subdomain takeover ops alert non-2xx keeps typed recoverable tags", async () => {
  const captured: Array<{ error: unknown; context?: unknown }> = [];
  _setSubdomainTakeoverSentryForTests({
    captureException: ((error: unknown, context?: unknown) => {
      captured.push({ error, context });
      return "evt-ops-alert";
    }) as never,
    captureMessage: (() => "evt-msg") as never,
  });

  process.env.OPS_ALERT_WEBHOOK = "https://ops.example/webhook";
  globalThis.fetch = (async () => {
    return new Response("fail", { status: 503, statusText: "Service Unavailable" });
  }) as typeof fetch;

  try {
    await _alertOpsForTests("subdomain-takeover-findings", { findingCount: 1 });
  } finally {
    _resetSubdomainTakeoverSentryForTests();
    if (ORIGINAL_WEBHOOK === undefined) delete process.env.OPS_ALERT_WEBHOOK;
    else process.env.OPS_ALERT_WEBHOOK = ORIGINAL_WEBHOOK;
    globalThis.fetch = ORIGINAL_FETCH;
  }

  assert.equal(captured.length, 1);
  const ctx = captured[0].context as
    | { tags?: Record<string, string>; extra?: Record<string, unknown> }
    | undefined;

  assert.equal(ctx?.tags?.source, "ops-alert");
  assert.equal(ctx?.tags?.category, "recoverable");
  assert.equal(ctx?.tags?.alert, "ops-alert-delivery-failed");

  const meta = ctx?.extra?.engine_error_metadata as Record<string, unknown> | undefined;
  assert.equal(meta?.status, 503);
  assert.equal(meta?.statusText, "Service Unavailable");
});
