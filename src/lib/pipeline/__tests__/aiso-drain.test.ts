// StarScreener Pipeline — POST /api/cron/aiso-drain tests.
//
// Covers:
//   - empty queue → 0 drained
//   - N rows all succeed → queue truncated, N processed
//   - 1 success + 1 fail → only success row removed; fail stays
//   - dryRun → no truncation, no scanner calls
//   - cron auth missing/wrong → 401 (or 503 when unset in production)
//   - dedup: 2 rows for same repo → only 1 scanner call, both removed
//   - `limit` respected
//
// Run with:
//   npx tsx --test src/lib/pipeline/__tests__/aiso-drain.test.ts
//
// Environment isolation: the test points STARSCREENER_DATA_DIR at a
// per-run temp dir BEFORE importing the route, so the drain route's
// transitively-imported `currentDataDir()` helper resolves I/O into the
// temp tree. The scanner (`getAisoToolsScan`) is swapped out via a
// Symbol-keyed override bag on `globalThis` — same pattern the producer
// route uses for its rate-limit reset hook.

import {
  mkdtempSync,
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const TMP_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "ss-aiso-drain-"));
process.env.STARSCREENER_DATA_DIR = TMP_DATA_DIR;
process.env.STARSCREENER_PERSIST = "false";
// Redirect the repo-profiles persist path into the temp tree so the
// drain's `persistAisoScan` call doesn't touch the real
// `data/repo-profiles.json`. Without this, running the test would
// rewrite the committed profile file.
process.env.STARSCREENER_REPO_PROFILES_PATH = path.join(
  TMP_DATA_DIR,
  "repo-profiles.json",
);
// CRON_SECRET present in tests so verifyCronAuth's "dev fallback" (which
// auto-ok's when the env is unset) doesn't mask our 401 assertion.
process.env.CRON_SECRET = "test-cron-secret-0123456789abcdef";

import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

import type { AisoToolsScan } from "../../aiso-tools";

const QUEUE_FILE = path.join(TMP_DATA_DIR, "aiso-rescan-queue.jsonl");

// Match the producer row exactly so readQueue() content-hashes an id.
interface ProducerRow {
  fullName: string;
  websiteUrl: string | null;
  requestedAt: string;
  requestIp: string;
  source: string;
}

function writeQueue(rows: ProducerRow[]): void {
  if (rows.length === 0) {
    writeFileSync(QUEUE_FILE, "", "utf8");
    return;
  }
  const body = rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
  writeFileSync(QUEUE_FILE, body, "utf8");
}

function readRawQueueLines(): string[] {
  if (!existsSync(QUEUE_FILE)) return [];
  const raw = readFileSync(QUEUE_FILE, "utf8");
  return raw.split(/\r?\n/).filter((l) => l.length > 0);
}

function clearQueue(): void {
  try {
    rmSync(QUEUE_FILE, { force: true });
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Scanner override plumbing
// ---------------------------------------------------------------------------

const DRAIN_OVERRIDE_KEY = Symbol.for("trendingrepo.aiso.drain.test");
interface OverrideBag {
  overrides?: {
    scanner?: (url: string | null) => Promise<AisoToolsScan | null>;
    delayMs?: number;
  };
}

function setScanner(
  scanner: (url: string | null) => Promise<AisoToolsScan | null>,
): void {
  const bag =
    (globalThis as unknown as Record<symbol, OverrideBag | undefined>)[
      DRAIN_OVERRIDE_KEY
    ] ?? {};
  bag.overrides = { scanner, delayMs: 0 };
  (globalThis as unknown as Record<symbol, OverrideBag>)[DRAIN_OVERRIDE_KEY] =
    bag;
}

function clearOverrides(): void {
  const bag = (globalThis as unknown as Record<symbol, OverrideBag | undefined>)[
    DRAIN_OVERRIDE_KEY
  ];
  if (bag) bag.overrides = { delayMs: 0 };
}

function makeCompletedScan(url: string | null): AisoToolsScan {
  return {
    scanId: `scan-${Math.random().toString(36).slice(2, 10)}`,
    url: url ?? "https://unknown.example",
    projectName: null,
    projectUrl: null,
    source: null,
    status: "completed",
    score: 80,
    tier: "visible",
    runtimeVisibility: 80,
    scanDurationMs: 1234,
    completedAt: new Date().toISOString(),
    resultUrl: "https://aiso.tools/scan/fake",
    dimensions: [],
    issues: [],
    promptTests: [],
  };
}

// ---------------------------------------------------------------------------
// Route invocation helper
// ---------------------------------------------------------------------------

interface DrainResponseBody {
  ok: boolean;
  drained?: number;
  succeeded?: number;
  failed?: number;
  errors?: string[];
  remaining?: number;
  durationMs?: number;
  dryRun?: boolean;
  error?: string;
  reason?: string;
}

async function invokeDrain(options?: {
  auth?: string | null;
  body?: Record<string, unknown>;
}): Promise<{ status: number; body: DrainResponseBody }> {
  const { POST } = await import("../../../app/api/cron/aiso-drain/route");
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (options?.auth !== null) {
    headers["authorization"] =
      options?.auth ?? `Bearer ${process.env.CRON_SECRET}`;
  }
  const req = new Request("http://localhost/api/cron/aiso-drain", {
    method: "POST",
    headers,
    body: options?.body ? JSON.stringify(options.body) : "{}",
  });
  const res: Response = await POST(req as never);
  const body = (await res.json()) as DrainResponseBody;
  return { status: res.status, body };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function fixtureRow(
  fullName: string,
  websiteUrl: string | null,
  queuedAt: string,
  ip = "203.0.113.1",
): ProducerRow {
  return {
    fullName,
    websiteUrl,
    requestedAt: queuedAt,
    requestIp: ip,
    source: "user-retry",
  };
}

// ---------------------------------------------------------------------------
// Test lifecycle
// ---------------------------------------------------------------------------

before(async () => {
  // Eager-import so the symbol-keyed override bag is initialized before
  // the first setScanner() call lands.
  await import("../../../app/api/cron/aiso-drain/route");
});

beforeEach(() => {
  clearQueue();
  clearOverrides();
});

after(() => {
  try {
    rmSync(TMP_DATA_DIR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

test("401 when Authorization header is missing", async () => {
  const { status, body } = await invokeDrain({ auth: null });
  assert.equal(status, 401);
  assert.equal(body.ok, false);
});

test("401 when Authorization header is wrong", async () => {
  const { status, body } = await invokeDrain({ auth: "Bearer nope-nope" });
  assert.equal(status, 401);
  assert.equal(body.ok, false);
});

// ---------------------------------------------------------------------------
// Empty queue
// ---------------------------------------------------------------------------

test("drain with empty queue → 0 drained", async () => {
  // No file at all.
  const scannerCalls: Array<string | null> = [];
  setScanner(async (url) => {
    scannerCalls.push(url);
    return makeCompletedScan(url);
  });

  const { status, body } = await invokeDrain();
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.drained, 0);
  assert.equal(body.succeeded, 0);
  assert.equal(body.failed, 0);
  assert.equal(body.remaining, 0);
  assert.equal(scannerCalls.length, 0);
});

// ---------------------------------------------------------------------------
// Happy path — all succeed
// ---------------------------------------------------------------------------

test("3 rows all succeed → queue truncated to 0", async () => {
  writeQueue([
    fixtureRow("vercel/next.js", "https://nextjs.org", "2026-04-24T10:00:00Z"),
    fixtureRow("facebook/react", "https://react.dev", "2026-04-24T10:01:00Z"),
    fixtureRow("tc39/proposal-x", null, "2026-04-24T10:02:00Z"),
  ]);

  const scannerCalls: Array<string | null> = [];
  setScanner(async (url) => {
    scannerCalls.push(url);
    return makeCompletedScan(url);
  });

  const { status, body } = await invokeDrain({ body: { limit: 10 } });
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.drained, 3);
  assert.equal(body.succeeded, 3);
  assert.equal(body.failed, 0);
  assert.equal(body.remaining, 0);
  assert.equal(scannerCalls.length, 3);
  assert.deepEqual(
    scannerCalls.sort(),
    ["https://nextjs.org", "https://react.dev", null].sort(),
  );

  const lines = readRawQueueLines();
  assert.equal(lines.length, 0);
});

// ---------------------------------------------------------------------------
// Mixed success + failure
// ---------------------------------------------------------------------------

test("1 success + 1 fail → only success row removed", async () => {
  writeQueue([
    fixtureRow("good/repo", "https://good.example", "2026-04-24T10:00:00Z"),
    fixtureRow("bad/repo", "https://bad.example", "2026-04-24T10:01:00Z"),
  ]);

  setScanner(async (url) => {
    if (url === "https://bad.example") {
      throw new Error("scanner exploded");
    }
    return makeCompletedScan(url);
  });

  const { status, body } = await invokeDrain();
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.drained, 2);
  assert.equal(body.succeeded, 1);
  assert.equal(body.failed, 1);
  assert.equal(body.remaining, 1);
  assert.ok(body.errors && body.errors.length === 1);
  assert.match(body.errors![0], /bad\/repo/);
  assert.match(body.errors![0], /scanner exploded/);

  const lines = readRawQueueLines();
  assert.equal(lines.length, 1);
  const remaining = JSON.parse(lines[0]) as ProducerRow;
  assert.equal(remaining.fullName, "bad/repo");
});

// ---------------------------------------------------------------------------
// Dry run
// ---------------------------------------------------------------------------

test("dryRun → no truncation, no scanner calls", async () => {
  writeQueue([
    fixtureRow("a/a", "https://a.example", "2026-04-24T10:00:00Z"),
    fixtureRow("b/b", "https://b.example", "2026-04-24T10:01:00Z"),
  ]);

  let scannerCalls = 0;
  setScanner(async (url) => {
    scannerCalls += 1;
    return makeCompletedScan(url);
  });

  const { status, body } = await invokeDrain({ body: { dryRun: true } });
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.dryRun, true);
  assert.equal(body.drained, 2);
  assert.equal(body.succeeded, 0);
  assert.equal(body.failed, 0);
  assert.equal(body.remaining, 2);
  assert.equal(scannerCalls, 0);

  const lines = readRawQueueLines();
  assert.equal(lines.length, 2);
});

// ---------------------------------------------------------------------------
// Dedup
// ---------------------------------------------------------------------------

test("2 queue rows for same repo → 1 scanner call, both removed", async () => {
  writeQueue([
    fixtureRow("dup/repo", "https://old.example", "2026-04-24T09:00:00Z", "ip1"),
    fixtureRow("dup/repo", "https://new.example", "2026-04-24T10:00:00Z", "ip2"),
  ]);

  const scannerCalls: Array<string | null> = [];
  setScanner(async (url) => {
    scannerCalls.push(url);
    return makeCompletedScan(url);
  });

  const { status, body } = await invokeDrain();
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  // `drained` is the count of unique repos selected, not queue rows.
  assert.equal(body.drained, 1);
  assert.equal(body.succeeded, 1);
  assert.equal(body.failed, 0);
  assert.equal(scannerCalls.length, 1);
  // The newer websiteUrl should win the dedup.
  assert.equal(scannerCalls[0], "https://new.example");

  const lines = readRawQueueLines();
  assert.equal(lines.length, 0, "both dup rows should be removed");
});

// ---------------------------------------------------------------------------
// Limit
// ---------------------------------------------------------------------------

test("limit caps number of scanner calls", async () => {
  writeQueue([
    fixtureRow("r/1", "https://1.example", "2026-04-24T10:00:00Z"),
    fixtureRow("r/2", "https://2.example", "2026-04-24T10:01:00Z"),
    fixtureRow("r/3", "https://3.example", "2026-04-24T10:02:00Z"),
    fixtureRow("r/4", "https://4.example", "2026-04-24T10:03:00Z"),
    fixtureRow("r/5", "https://5.example", "2026-04-24T10:04:00Z"),
  ]);

  let scannerCalls = 0;
  setScanner(async (url) => {
    scannerCalls += 1;
    return makeCompletedScan(url);
  });

  const { status, body } = await invokeDrain({ body: { limit: 2 } });
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.drained, 2);
  assert.equal(body.succeeded, 2);
  assert.equal(scannerCalls, 2);
  assert.equal(body.remaining, 3);

  const lines = readRawQueueLines();
  assert.equal(lines.length, 3, "3 rows should remain in the queue");
});
