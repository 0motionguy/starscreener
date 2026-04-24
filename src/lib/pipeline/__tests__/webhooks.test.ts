// StarScreener — outbound webhooks tests.
//
// Covers:
//   - publishBreakoutToWebhooks / publishFundingEvent enqueue matching targets
//   - filter mismatches don't enqueue
//   - idempotent dedup: re-publishing same event for same target → 1 row
//   - Slack + Discord formatter shape
//   - Drain success → queue truncated
//   - Drain failure → attempts incremented
//   - Drain at threshold → dead-letter
//   - Drain rate-limit delay honoured
//   - Scan endpoint idempotent across repeated runs
//
// Run with:
//   npx tsx --test src/lib/pipeline/__tests__/webhooks.test.ts
//
// Environment isolation mirrors aiso-drain.test.ts — point
// STARSCREENER_DATA_DIR at a temp dir before importing, set
// WEBHOOK_TARGETS_PATH at a per-test JSON file.

import {
  mkdtempSync,
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const TMP_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "ss-webhooks-"));
process.env.STARSCREENER_DATA_DIR = TMP_DATA_DIR;
process.env.STARSCREENER_PERSIST = "false";
process.env.CRON_SECRET = "test-cron-secret-0123456789abcdef";

const TARGETS_FILE = path.join(TMP_DATA_DIR, "webhook-targets.json");
process.env.WEBHOOK_TARGETS_PATH = TARGETS_FILE;

import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

import {
  __resetTargetCache,
  publishBreakoutToWebhooks,
  publishFundingEvent,
  readQueue,
  queueLocation,
  deadLetterLocation,
} from "../../webhooks/publish";
import {
  formatBreakoutForSlack,
  formatFundingForSlack,
} from "../../webhooks/providers/slack";
import {
  formatBreakoutForDiscord,
  formatFundingForDiscord,
} from "../../webhooks/providers/discord";
import type {
  WebhookBreakoutRepo,
  WebhookFundingEvent,
  WebhookTarget,
} from "../../webhooks/types";

const QUEUE_FILE = path.join(TMP_DATA_DIR, "webhook-queue.jsonl");
const DEAD_LETTER_FILE = path.join(TMP_DATA_DIR, "webhook-dead-letter.jsonl");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function writeTargets(targets: unknown[]): void {
  writeFileSync(TARGETS_FILE, JSON.stringify(targets, null, 2), "utf8");
  __resetTargetCache();
}

function clearAll(): void {
  for (const f of [QUEUE_FILE, DEAD_LETTER_FILE, TARGETS_FILE]) {
    try {
      rmSync(f, { force: true });
    } catch {
      /* ignore */
    }
  }
  __resetTargetCache();
}

function sampleBreakout(
  partial: Partial<WebhookBreakoutRepo> = {},
): WebhookBreakoutRepo {
  return {
    fullName: "vercel/next.js",
    name: "next.js",
    owner: "vercel",
    description: "The React framework",
    url: "https://github.com/vercel/next.js",
    language: "TypeScript",
    stars: 120000,
    momentumScore: 87,
    movementStatus: "breakout",
    lastCommitAt: "2026-04-24T10:00:00Z",
    starsDelta24h: 420,
    starsDelta7d: 2400,
    ...partial,
  };
}

function sampleFunding(
  partial: Partial<WebhookFundingEvent> = {},
): WebhookFundingEvent {
  return {
    id: "fund-123",
    headline: "Acme raises $50M Series B",
    description: "AI startup Acme raised $50M led by a16z",
    sourceUrl: "https://techcrunch.com/acme-series-b",
    publishedAt: "2026-04-24T09:00:00Z",
    companyName: "Acme",
    amountDisplay: "$50M",
    amountUsd: 50_000_000,
    roundType: "series-b",
    ...partial,
  };
}

function validTarget(partial: Partial<WebhookTarget>): WebhookTarget {
  return {
    id: partial.id ?? "t1",
    provider: partial.provider ?? "slack",
    url: partial.url ?? "https://hooks.slack.com/services/T0/B0/XXX",
    events: partial.events ?? ["breakout", "funding"],
    filters: partial.filters,
    enabled: partial.enabled !== false,
  };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

before(async () => {
  // Eager-import route modules so the symbol override bag is in place
  // before the first test mutates it.
  await import("../../../app/api/cron/webhooks/flush/route");
  await import("../../../app/api/cron/webhooks/scan/route");
});

beforeEach(() => {
  clearAll();
});

after(() => {
  try {
    rmSync(TMP_DATA_DIR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

// ---------------------------------------------------------------------------
// Formatter shape
// ---------------------------------------------------------------------------

test("slack breakout formatter returns header + section + actions blocks", () => {
  const payload = formatBreakoutForSlack(sampleBreakout());
  assert.ok(Array.isArray(payload.blocks));
  assert.equal(payload.blocks[0]?.type, "header");
  assert.match(String(payload.blocks[0]?.text?.text), /Breakout:/);
  const actions = payload.blocks.find((b) => b.type === "actions");
  assert.ok(actions, "actions block present");
  assert.match(payload.text, /Breakout:/);
});

test("slack funding formatter returns company + amount + round", () => {
  const payload = formatFundingForSlack(sampleFunding());
  assert.match(payload.text, /Acme/);
  assert.match(payload.text, /\$50M/);
  const section = payload.blocks.find((b) => b.type === "section" && b.fields);
  assert.ok(section, "fields section present");
  const amountField = section!.fields!.find((f) => /Amount/.test(f.text));
  assert.ok(amountField, "amount field present");
});

test("discord breakout formatter returns one embed with color + fields", () => {
  const payload = formatBreakoutForDiscord(sampleBreakout());
  assert.equal(payload.embeds.length, 1);
  assert.ok(payload.embeds[0].title.startsWith("Breakout:"));
  assert.equal(typeof payload.embeds[0].color, "number");
  assert.ok(payload.embeds[0].fields && payload.embeds[0].fields.length > 0);
});

test("discord funding formatter embeds amount + round", () => {
  const payload = formatFundingForDiscord(sampleFunding());
  assert.equal(payload.embeds.length, 1);
  const fields = payload.embeds[0].fields ?? [];
  const amount = fields.find((f) => f.name === "Amount");
  assert.ok(amount);
  assert.equal(amount!.value, "$50M");
});

// ---------------------------------------------------------------------------
// Publish — matching
// ---------------------------------------------------------------------------

test("publishBreakoutToWebhooks enqueues one row per matching target", async () => {
  writeTargets([
    validTarget({ id: "slack-a", provider: "slack" }),
    validTarget({
      id: "discord-b",
      provider: "discord",
      url: "https://discord.com/api/webhooks/123/abc",
    }),
    validTarget({ id: "funding-only", events: ["funding"] }),
  ]);

  const result = await publishBreakoutToWebhooks(sampleBreakout());
  assert.equal(result.enqueued, 2, "only breakout-listening targets enqueue");
  assert.equal(result.skipped, 0);

  const queue = await readQueue();
  assert.equal(queue.length, 2);
  const ids = queue.map((r) => r.targetId).sort();
  assert.deepEqual(ids, ["discord-b", "slack-a"]);
});

test("publishFundingEvent only fires funding-listed targets", async () => {
  writeTargets([
    validTarget({ id: "both", events: ["breakout", "funding"] }),
    validTarget({ id: "breakout-only", events: ["breakout"] }),
  ]);

  const result = await publishFundingEvent(sampleFunding());
  assert.equal(result.enqueued, 1);
  const queue = await readQueue();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].targetId, "both");
  assert.equal(queue[0].event, "funding");
});

// ---------------------------------------------------------------------------
// Publish — filters
// ---------------------------------------------------------------------------

test("minMomentum filter prevents enqueue when below threshold", async () => {
  writeTargets([
    validTarget({
      id: "strict",
      filters: { minMomentum: 90 },
    }),
  ]);

  const repo = sampleBreakout({ momentumScore: 72 });
  const result = await publishBreakoutToWebhooks(repo);
  assert.equal(result.enqueued, 0);
  assert.equal((await readQueue()).length, 0);
});

test("minAmountUsd filter prevents enqueue when below threshold", async () => {
  writeTargets([
    validTarget({
      id: "bigmoney",
      events: ["funding"],
      filters: { minAmountUsd: 100_000_000 },
    }),
  ]);

  const result = await publishFundingEvent(sampleFunding({ amountUsd: 5_000_000 }));
  assert.equal(result.enqueued, 0);
});

test("languages filter matches case-insensitively", async () => {
  writeTargets([
    validTarget({
      id: "rust-only",
      filters: { languages: ["rust"] },
    }),
  ]);

  const tsResult = await publishBreakoutToWebhooks(
    sampleBreakout({ language: "TypeScript" }),
  );
  assert.equal(tsResult.enqueued, 0);

  const rustResult = await publishBreakoutToWebhooks(
    sampleBreakout({ fullName: "a/b", language: "Rust" }),
  );
  assert.equal(rustResult.enqueued, 1);
});

// ---------------------------------------------------------------------------
// Publish — idempotent dedup
// ---------------------------------------------------------------------------

test("re-publishing same breakout does not duplicate the queue row", async () => {
  writeTargets([validTarget({ id: "only" })]);

  const first = await publishBreakoutToWebhooks(sampleBreakout());
  assert.equal(first.enqueued, 1);
  assert.equal(first.skipped, 0);

  const second = await publishBreakoutToWebhooks(sampleBreakout());
  assert.equal(second.enqueued, 0, "second publish should dedup");
  assert.equal(second.skipped, 1);

  const queue = await readQueue();
  assert.equal(queue.length, 1);
});

// ---------------------------------------------------------------------------
// Target validation — bad URLs dropped
// ---------------------------------------------------------------------------

test("non-https or non-provider-domain URLs are silently dropped", async () => {
  writeTargets([
    {
      id: "bad-proto",
      provider: "slack",
      url: "http://hooks.slack.com/services/T/B/X",
      events: ["breakout"],
      enabled: true,
    },
    {
      id: "wrong-host",
      provider: "slack",
      url: "https://evil.example/hook",
      events: ["breakout"],
      enabled: true,
    },
    validTarget({ id: "good", provider: "slack" }),
  ]);

  const result = await publishBreakoutToWebhooks(sampleBreakout());
  assert.equal(result.enqueued, 1);
  const queue = await readQueue();
  assert.equal(queue[0].targetId, "good");
});

// ---------------------------------------------------------------------------
// Drain route — success / fail / dead-letter
// ---------------------------------------------------------------------------

const FLUSH_KEY = Symbol.for("starscreener.webhooks.flush.test");
interface FlushOverrideBag {
  overrides?: {
    fetcher?: (
      url: string,
      init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
    ) => Promise<{ ok: boolean; status: number; statusText?: string }>;
    delayMs?: number;
    timeoutMs?: number;
    maxAttempts?: number;
  };
}
function setFlushOverrides(
  o: Required<FlushOverrideBag>["overrides"],
): void {
  const bag =
    (globalThis as unknown as Record<symbol, FlushOverrideBag | undefined>)[
      FLUSH_KEY
    ] ?? {};
  bag.overrides = o;
  (globalThis as unknown as Record<symbol, FlushOverrideBag>)[FLUSH_KEY] = bag;
}
function clearFlushOverrides(): void {
  const bag = (globalThis as unknown as Record<symbol, FlushOverrideBag | undefined>)[
    FLUSH_KEY
  ];
  if (bag) bag.overrides = { delayMs: 0 };
}

interface FlushResponseBody {
  ok: boolean;
  processed?: number;
  delivered?: number;
  failed?: number;
  deadLetter?: number;
  remaining?: number;
  durationMs?: number;
  error?: string;
}

async function invokeFlush(
  auth: string | null = `Bearer ${process.env.CRON_SECRET}`,
): Promise<{ status: number; body: FlushResponseBody }> {
  const { POST } = await import("../../../app/api/cron/webhooks/flush/route");
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (auth !== null) headers["authorization"] = auth;
  const req = new Request("http://localhost/api/cron/webhooks/flush", {
    method: "POST",
    headers,
    body: "{}",
  });
  const res: Response = await POST(req as never);
  return { status: res.status, body: (await res.json()) as FlushResponseBody };
}

test("flush with empty queue → delivered: 0", async () => {
  writeTargets([]);
  clearFlushOverrides();
  const { status, body } = await invokeFlush();
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.delivered, 0);
  assert.equal(body.processed, 0);
});

test("flush 401 without auth", async () => {
  const { status } = await invokeFlush(null);
  assert.equal(status, 401);
});

test("flush success → queue drained, delivered count matches", async () => {
  writeTargets([validTarget({ id: "s1", provider: "slack" })]);
  await publishBreakoutToWebhooks(sampleBreakout());
  assert.equal((await readQueue()).length, 1);

  let posts = 0;
  setFlushOverrides({
    delayMs: 0,
    timeoutMs: 5000,
    maxAttempts: 5,
    fetcher: async () => {
      posts += 1;
      return { ok: true, status: 200 };
    },
  });

  const { status, body } = await invokeFlush();
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.delivered, 1);
  assert.equal(body.remaining, 0);
  assert.equal(posts, 1);
  assert.equal((await readQueue()).length, 0);
});

test("flush failure → row retained, attempts incremented", async () => {
  writeTargets([validTarget({ id: "s1", provider: "slack" })]);
  await publishBreakoutToWebhooks(sampleBreakout());

  setFlushOverrides({
    delayMs: 0,
    timeoutMs: 5000,
    maxAttempts: 5,
    fetcher: async () => ({ ok: false, status: 500, statusText: "boom" }),
  });

  const { body } = await invokeFlush();
  assert.equal(body.ok, true);
  assert.equal(body.failed, 1);
  assert.equal(body.delivered, 0);
  assert.equal(body.remaining, 1);

  const queue = await readQueue();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].attempts, 1);
  assert.match(queue[0].lastError ?? "", /500/);
});

test("flush with >=maxAttempts → row moved to dead-letter", async () => {
  writeTargets([validTarget({ id: "s1", provider: "slack" })]);
  await publishBreakoutToWebhooks(sampleBreakout());

  // Simulate a row that's already had 4 failed attempts. Next failure
  // hits the 5-attempt cap and moves to dead-letter.
  const queue = await readQueue();
  queue[0].attempts = 4;
  writeFileSync(QUEUE_FILE, JSON.stringify(queue[0]) + "\n", "utf8");

  setFlushOverrides({
    delayMs: 0,
    timeoutMs: 5000,
    maxAttempts: 5,
    fetcher: async () => ({ ok: false, status: 500 }),
  });

  const { body } = await invokeFlush();
  assert.equal(body.ok, true);
  assert.equal(body.deadLetter, 1);
  assert.equal(body.remaining, 0);

  assert.ok(existsSync(DEAD_LETTER_FILE), "dead-letter file created");
  const deadLines = readFileSync(DEAD_LETTER_FILE, "utf8").split(/\r?\n/).filter(Boolean);
  assert.equal(deadLines.length, 1);
  const deadRow = JSON.parse(deadLines[0]);
  assert.equal(deadRow.deadLetter, true);
  assert.equal(deadRow.attempts, 5);
});

test("flush respects inter-post delay", async () => {
  writeTargets([
    validTarget({ id: "s1", provider: "slack" }),
    validTarget({
      id: "d1",
      provider: "discord",
      url: "https://discord.com/api/webhooks/1/abc",
    }),
  ]);
  await publishBreakoutToWebhooks(sampleBreakout());
  assert.equal((await readQueue()).length, 2);

  const timestamps: number[] = [];
  setFlushOverrides({
    delayMs: 50, // small but measurable
    timeoutMs: 5000,
    maxAttempts: 5,
    fetcher: async () => {
      timestamps.push(Date.now());
      return { ok: true, status: 200 };
    },
  });

  const { body } = await invokeFlush();
  assert.equal(body.delivered, 2);
  assert.equal(timestamps.length, 2);
  // Gap between posts should be >= 50ms (allow 10ms scheduling slack).
  const gap = timestamps[1] - timestamps[0];
  assert.ok(gap >= 40, `expected ~50ms gap, got ${gap}ms`);
});

// ---------------------------------------------------------------------------
// Scan endpoint — idempotency
// ---------------------------------------------------------------------------

const SCAN_KEY = Symbol.for("starscreener.webhooks.scan.test");
interface ScanOverrideBag {
  overrides?: {
    repos?: WebhookBreakoutRepo[];
    fundingEvents?: WebhookFundingEvent[];
    now?: number;
  };
}
function setScanOverrides(o: Required<ScanOverrideBag>["overrides"]): void {
  const bag =
    (globalThis as unknown as Record<symbol, ScanOverrideBag | undefined>)[
      SCAN_KEY
    ] ?? {};
  bag.overrides = o;
  (globalThis as unknown as Record<symbol, ScanOverrideBag>)[SCAN_KEY] = bag;
}

interface ScanResponseBody {
  ok: boolean;
  breakoutsSeen?: number;
  breakoutsEnqueued?: number;
  breakoutsSkipped?: number;
  fundingSeen?: number;
  fundingEnqueued?: number;
  fundingSkipped?: number;
}

async function invokeScan(): Promise<ScanResponseBody> {
  const { POST } = await import("../../../app/api/cron/webhooks/scan/route");
  const req = new Request("http://localhost/api/cron/webhooks/scan", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: "{}",
  });
  const res: Response = await POST(req as never);
  return (await res.json()) as ScanResponseBody;
}

test("scan is idempotent across repeated runs", async () => {
  writeTargets([validTarget({ id: "s1", provider: "slack" })]);

  setScanOverrides({
    repos: [sampleBreakout()],
    fundingEvents: [sampleFunding()],
    now: Date.now(),
  });

  const first = await invokeScan();
  assert.equal(first.ok, true);
  assert.equal(first.breakoutsEnqueued, 1);
  assert.equal(first.fundingEnqueued, 1);

  const second = await invokeScan();
  assert.equal(second.ok, true);
  assert.equal(second.breakoutsEnqueued, 0, "re-scan should dedup");
  assert.equal(second.fundingEnqueued, 0);
  assert.equal(second.breakoutsSkipped, 1);

  const queue = await readQueue();
  assert.equal(queue.length, 2, "still exactly 2 rows after two scans");
});

// ---------------------------------------------------------------------------
// Path tests — ensure we didn't regress queue/dead-letter paths
// ---------------------------------------------------------------------------

test("queueLocation + deadLetterLocation resolve under STARSCREENER_DATA_DIR", () => {
  assert.equal(queueLocation(), QUEUE_FILE);
  assert.equal(deadLetterLocation(), DEAD_LETTER_FILE);
});
