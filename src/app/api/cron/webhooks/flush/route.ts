// POST /api/cron/webhooks/flush
//
// Drain worker for the outbound-webhook queue at
// `.data/webhook-queue.jsonl`.
//
// Lifecycle:
//   1. Read the queue + targets config.
//   2. For every undelivered row whose target still exists:
//        - Format the payload via the provider-specific formatter
//          (Slack Block Kit / Discord embed).
//        - POST to the target URL with a 5s timeout. 3s gap between POSTs
//          so we don't hammer Slack/Discord rate limits on a deep queue.
//        - On 2xx: mark delivered, drop from the queue.
//        - On non-2xx / timeout: increment `attempts`. When attempts > 5,
//          move to `.data/webhook-dead-letter.jsonl` so the queue can
//          drain forward without a poison row.
//   3. Rewrite the queue atomically (JSONL tmp-rename).
//
// Auth: CRON_SECRET bearer — same pattern as every other cron route. The
// route never logs the webhook URL or the full payload; only the target
// id + event type make it into logs.
//
// Response shape:
//   200 { ok, processed, delivered, failed, deadLetter, remaining, durationMs }
//   401 unauthorized
//   503 not configured
//   500 unexpected

import { NextRequest, NextResponse } from "next/server";

import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import {
  appendDeadLetter,
  loadTargets,
  readQueue,
  writeQueue,
} from "@/lib/webhooks/publish";
import type {
  WebhookBreakoutRepo,
  WebhookDelivery,
  WebhookFundingEvent,
  WebhookTarget,
} from "@/lib/webhooks/types";
import {
  formatBreakoutForSlack,
  formatFundingForSlack,
  type SlackPayload,
} from "@/lib/webhooks/providers/slack";
import {
  formatBreakoutForDiscord,
  formatFundingForDiscord,
  type DiscordPayload,
} from "@/lib/webhooks/providers/discord";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const DEFAULT_INTER_POST_DELAY_MS = 3_000;
const DEFAULT_POST_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_ATTEMPTS = 5;

const POST_CACHE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

// ---------------------------------------------------------------------------
// Test overrides (same symbol-keyed pattern the aiso-drain uses)
// ---------------------------------------------------------------------------

export interface WebhookFlushTestOverrides {
  /** Replace fetch; resolves with a Response-like `{ ok, status }`. */
  fetcher?: (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
  ) => Promise<{ ok: boolean; status: number; statusText?: string }>;
  /** Override the 3s post-to-post delay (tests pass 0). */
  delayMs?: number;
  /** Override the 5s timeout (tests can pass a small value to assert behavior). */
  timeoutMs?: number;
  /** Override the 5-attempt dead-letter threshold. */
  maxAttempts?: number;
}

// APP-14: the Symbol.for(...) override pattern previously walked the
// global registry on every request — fine for prod (no overrides set)
// but unnecessary work and a footgun (any module could plant overrides).
// Gate the lookup on NODE_ENV === "test" so prod skips the read entirely.
const WEBHOOK_FLUSH_TEST_KEY = Symbol.for("starscreener.webhooks.flush.test");

interface OverrideBag {
  overrides?: WebhookFlushTestOverrides;
}

function getOverrides(): WebhookFlushTestOverrides {
  if (process.env.NODE_ENV !== "test") return {};
  const bag = (globalThis as unknown as Record<symbol, OverrideBag | undefined>)[
    WEBHOOK_FLUSH_TEST_KEY
  ];
  return bag?.overrides ?? {};
}

if (process.env.NODE_ENV === "test") {
  (globalThis as unknown as Record<symbol, OverrideBag>)[
    WEBHOOK_FLUSH_TEST_KEY
  ] = (globalThis as unknown as Record<symbol, OverrideBag>)[
    WEBHOOK_FLUSH_TEST_KEY
  ] ?? {};
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatPayload(
  target: WebhookTarget,
  delivery: WebhookDelivery,
): SlackPayload | DiscordPayload | null {
  if (delivery.event === "breakout") {
    const repo = delivery.payload as WebhookBreakoutRepo;
    return target.provider === "slack"
      ? formatBreakoutForSlack(repo)
      : formatBreakoutForDiscord(repo);
  }
  if (delivery.event === "funding") {
    const ev = delivery.payload as WebhookFundingEvent;
    return target.provider === "slack"
      ? formatFundingForSlack(ev)
      : formatFundingForDiscord(ev);
  }
  // revenue: phase-2 — no formatter yet. Leave as null so the drain
  // records a failure rather than POSTing a bare payload.
  return null;
}

// ---------------------------------------------------------------------------
// POST with 5s timeout
// ---------------------------------------------------------------------------

async function postWithTimeout(
  url: string,
  body: unknown,
  timeoutMs: number,
  fetcher: WebhookFlushTestOverrides["fetcher"],
): Promise<{ ok: boolean; status: number; statusText?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const init = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    };
    if (fetcher) {
      return await fetcher(url, init);
    }
    const res = await fetch(url, init);
    return { ok: res.ok, status: res.status, statusText: res.statusText };
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Drain
// ---------------------------------------------------------------------------

interface FlushResult {
  processed: number;
  delivered: number;
  failed: number;
  deadLetter: number;
  remaining: number;
  durationMs: number;
}

async function runFlush(): Promise<FlushResult> {
  const startedAt = Date.now();
  const queue = await readQueue();

  if (queue.length === 0) {
    return {
      processed: 0,
      delivered: 0,
      failed: 0,
      deadLetter: 0,
      remaining: 0,
      durationMs: Date.now() - startedAt,
    };
  }

  const targets = loadTargets();
  const byId = new Map<string, WebhookTarget>();
  for (const t of targets) byId.set(t.id, t);

  const overrides = getOverrides();
  const delayMs =
    typeof overrides.delayMs === "number" && overrides.delayMs >= 0
      ? overrides.delayMs
      : DEFAULT_INTER_POST_DELAY_MS;
  const timeoutMs =
    typeof overrides.timeoutMs === "number" && overrides.timeoutMs > 0
      ? overrides.timeoutMs
      : DEFAULT_POST_TIMEOUT_MS;
  const maxAttempts =
    typeof overrides.maxAttempts === "number" && overrides.maxAttempts > 0
      ? overrides.maxAttempts
      : DEFAULT_MAX_ATTEMPTS;

  const next: WebhookDelivery[] = [];
  let delivered = 0;
  let failed = 0;
  let deadLetter = 0;
  let processed = 0;
  let postIndex = 0;

  for (const row of queue) {
    // Already delivered in a previous drain — skip (and drop from queue).
    if (row.deliveredAt) continue;

    const target = byId.get(row.targetId);
    if (!target) {
      // Target deleted since enqueue. Drop the row silently; dropping is
      // correct behavior because the operator has explicitly removed the
      // recipient. If we kept the row it would pile up forever.
      continue;
    }

    processed += 1;
    const payload = formatPayload(target, row);
    if (!payload) {
      // No formatter available — treat as a failure. Could be a future
      // revenue row with no provider shape yet.
      const attempts = row.attempts + 1;
      const lastError = `no formatter for event=${row.event} provider=${target.provider}`;
      if (attempts >= maxAttempts) {
        await appendDeadLetter({ ...row, attempts, lastError });
        deadLetter += 1;
      } else {
        next.push({ ...row, attempts, lastError });
        failed += 1;
      }
      continue;
    }

    if (postIndex > 0 && delayMs > 0) {
      await sleep(delayMs);
    }
    postIndex += 1;

    let res: { ok: boolean; status: number; statusText?: string };
    try {
      res = await postWithTimeout(target.url, payload, timeoutMs, overrides.fetcher);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const attempts = row.attempts + 1;
      if (attempts >= maxAttempts) {
        await appendDeadLetter({ ...row, attempts, lastError: message });
        deadLetter += 1;
      } else {
        next.push({ ...row, attempts, lastError: message });
        failed += 1;
      }
      console.warn(
        `[webhooks:flush] target=${target.id} event=${row.event} threw (attempt ${attempts})`,
      );
      continue;
    }

    if (res.ok) {
      delivered += 1;
      // deliveredAt tracked but row dropped from queue on success.
      // (Kept on the stack for potential future "recently-delivered"
      //  audit, but committed only via the drop-from-queue path.)
      continue;
    }

    const attempts = row.attempts + 1;
    const lastError = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`;
    if (attempts >= maxAttempts) {
      await appendDeadLetter({ ...row, attempts, lastError });
      deadLetter += 1;
    } else {
      next.push({ ...row, attempts, lastError });
      failed += 1;
    }
    console.warn(
      `[webhooks:flush] target=${target.id} event=${row.event} failed ${lastError} (attempt ${attempts})`,
    );
  }

  await writeQueue(next);

  return {
    processed,
    delivered,
    failed,
    deadLetter,
    remaining: next.length,
    durationMs: Date.now() - startedAt,
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny;

  try {
    const result = await runFlush();
    return NextResponse.json(
      { ok: true as const, ...result },
      { headers: POST_CACHE_HEADERS },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api:cron:webhooks:flush] unexpected failure", err);
    return NextResponse.json(
      { ok: false as const, error: message },
      { status: 500, headers: POST_CACHE_HEADERS },
    );
  }
}

// GET alias so Vercel Cron (which fires GET) works without extra config.
export async function GET(request: NextRequest) {
  return POST(request);
}
