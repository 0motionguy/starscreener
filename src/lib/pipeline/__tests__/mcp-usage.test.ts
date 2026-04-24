// MCP usage metering tests.
//
// Covers:
//   - recordUsage appends a valid row
//   - listUsageForUser filters by userId + month prefix
//   - summarizeUsage produces correct byTool / byDay / totalCalls / errors
//   - POST /api/mcp/record-call — 200 with valid x-user-token + body
//   - POST /api/mcp/record-call — 200 (anonymous) with NO x-user-token
//   - POST /api/mcp/record-call — 400 on bad body (missing tool/status)
//   - GET  /api/mcp/usage       — 401 with no auth
//   - GET  /api/mcp/usage       — 200 with valid x-user-token
//   - POST /api/cron/mcp/rotate-usage — drops rows older than retention
//   - POST /api/cron/mcp/rotate-usage — 401 without cron auth
//
// Environment isolation: point STARSCREENER_DATA_DIR at a per-run temp
// directory BEFORE importing the module under test. Set USER_TOKENS_JSON
// so `verifyUserAuth` resolves a known token → userId. Set CRON_SECRET
// so verifyCronAuth's "dev fallback" doesn't mask the 401 assertion.
//
// Run with:
//   npx tsx --test src/lib/pipeline/__tests__/mcp-usage.test.ts

import {
  mkdtempSync,
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const TMP_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "ss-mcp-usage-"));
process.env.STARSCREENER_DATA_DIR = TMP_DATA_DIR;
process.env.STARSCREENER_PERSIST = "false";
process.env.CRON_SECRET = "test-cron-secret-0123456789abcdef";
process.env.USER_TOKENS_JSON = JSON.stringify({
  "test-user-token-alice": "user_alice",
  "test-user-token-bob": "user_bob",
});
// Ensure the entitlements stub returns `true` (dev default) so records
// are included in the /api/mcp/usage response. NODE_ENV is declared
// read-only in TS types; cast to a mutable index signature.
(process.env as Record<string, string | undefined>).NODE_ENV = undefined;

import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

const USAGE_FILE = path.join(TMP_DATA_DIR, "mcp-usage.jsonl");

function clearUsageFile(): void {
  try {
    rmSync(USAGE_FILE, { force: true });
  } catch {
    /* ignore */
  }
}

function readLines(): string[] {
  if (!existsSync(USAGE_FILE)) return [];
  return readFileSync(USAGE_FILE, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.length > 0);
}

beforeEach(() => {
  clearUsageFile();
});

after(() => {
  try {
    rmSync(TMP_DATA_DIR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

// ---------------------------------------------------------------------------
// Unit — usage helpers
// ---------------------------------------------------------------------------

test("recordUsage appends a valid row", async () => {
  const {
    recordUsage,
    listUsageForUser,
  } = await import("../../mcp/usage");

  await recordUsage({
    userId: "user_alice",
    tool: "repo_profile_full",
    method: "tools/call",
    tokenUsed: 0,
    durationMs: 42,
    status: "ok",
  });

  const lines = readLines();
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.userId, "user_alice");
  assert.equal(parsed.tool, "repo_profile_full");
  assert.equal(parsed.method, "tools/call");
  assert.equal(parsed.status, "ok");
  assert.equal(parsed.tokenUsed, 0);
  assert.equal(parsed.durationMs, 42);
  assert.equal(typeof parsed.id, "string");
  assert.equal(typeof parsed.timestamp, "string");
  assert.equal(
    /^\d{4}-\d{2}-\d{2}T/.test(parsed.timestamp),
    true,
    "timestamp is ISO",
  );
  const out = await listUsageForUser("user_alice", {});
  assert.equal(out.length, 1);
});

test("listUsageForUser filters by userId and month", async () => {
  const { listUsageForUser } = await import("../../mcp/usage");

  // Seed 3 rows manually — mixes users and months.
  const rows = [
    {
      id: "row1",
      userId: "user_alice",
      tool: "top_gainers",
      method: "tools/call",
      tokenUsed: 0,
      durationMs: 10,
      status: "ok",
      timestamp: "2026-03-15T10:00:00.000Z",
    },
    {
      id: "row2",
      userId: "user_alice",
      tool: "top_gainers",
      method: "tools/call",
      tokenUsed: 0,
      durationMs: 20,
      status: "ok",
      timestamp: "2026-04-02T08:00:00.000Z",
    },
    {
      id: "row3",
      userId: "user_bob",
      tool: "top_gainers",
      method: "tools/call",
      tokenUsed: 0,
      durationMs: 30,
      status: "ok",
      timestamp: "2026-04-02T09:00:00.000Z",
    },
  ];
  writeFileSync(
    USAGE_FILE,
    rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
    "utf8",
  );

  const all = await listUsageForUser("user_alice", {});
  assert.equal(all.length, 2);

  const april = await listUsageForUser("user_alice", { month: "2026-04" });
  assert.equal(april.length, 1);
  assert.equal(april[0].id, "row2");

  const bob = await listUsageForUser("user_bob", {});
  assert.equal(bob.length, 1);
  assert.equal(bob[0].id, "row3");

  // Unknown user → empty.
  const none = await listUsageForUser("user_nobody", {});
  assert.equal(none.length, 0);
});

test("listUsageForUser rejects malformed month", async () => {
  const { listUsageForUser } = await import("../../mcp/usage");
  await assert.rejects(
    () => listUsageForUser("user_alice", { month: "2026-4" }),
    /YYYY-MM/,
  );
});

test("summarizeUsage byTool / byDay / totalCalls / errors", async () => {
  const { summarizeUsage } = await import("../../mcp/usage");

  const rows = [
    {
      id: "a",
      userId: "user_alice",
      tool: "top_gainers",
      method: "tools/call",
      tokenUsed: 0,
      durationMs: 10,
      status: "ok",
      timestamp: "2026-04-01T10:00:00.000Z",
    },
    {
      id: "b",
      userId: "user_alice",
      tool: "top_gainers",
      method: "tools/call",
      tokenUsed: 0,
      durationMs: 25,
      status: "error",
      errorMessage: "boom",
      timestamp: "2026-04-01T11:00:00.000Z",
    },
    {
      id: "c",
      userId: "user_alice",
      tool: "repo_profile_full",
      method: "tools/call",
      tokenUsed: 0,
      durationMs: 100,
      status: "ok",
      timestamp: "2026-04-02T12:00:00.000Z",
    },
    // Different user — must be excluded.
    {
      id: "d",
      userId: "user_bob",
      tool: "top_gainers",
      method: "tools/call",
      tokenUsed: 0,
      durationMs: 7,
      status: "ok",
      timestamp: "2026-04-02T12:00:00.000Z",
    },
  ];
  writeFileSync(
    USAGE_FILE,
    rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
    "utf8",
  );

  const summary = await summarizeUsage("user_alice", { month: "2026-04" });
  assert.equal(summary.totalCalls, 3);
  assert.deepEqual(summary.byTool, {
    top_gainers: 2,
    repo_profile_full: 1,
  });
  assert.deepEqual(summary.byDay, {
    "2026-04-01": 2,
    "2026-04-02": 1,
  });
  assert.equal(summary.errors, 1);
  assert.equal(summary.totalDurationMs, 135);
});

test("recordUsage truncates errorMessage to 200 chars", async () => {
  const { recordUsage } = await import("../../mcp/usage");
  const big = "x".repeat(500);
  await recordUsage({
    userId: "user_alice",
    tool: "repo_profile_full",
    method: "tools/call",
    tokenUsed: 0,
    durationMs: 5,
    status: "error",
    errorMessage: big,
  });
  const parsed = JSON.parse(readLines()[0]);
  assert.equal(parsed.errorMessage.length, 200);
});

// ---------------------------------------------------------------------------
// Route — POST /api/mcp/record-call
// ---------------------------------------------------------------------------

async function invokeRecordCall(options: {
  token?: string;
  body?: unknown;
}): Promise<{ status: number; body: unknown }> {
  const { POST } = await import(
    "../../../app/api/mcp/record-call/route"
  );
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (options.token) headers["x-user-token"] = options.token;
  const req = new Request("http://localhost/api/mcp/record-call", {
    method: "POST",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : "{}",
  });
  const res: Response = await POST(req as never);
  const body = (await res.json()) as unknown;
  return { status: res.status, body };
}

test("POST /api/mcp/record-call — 200 with x-user-token + valid body", async () => {
  const { status, body } = await invokeRecordCall({
    token: "test-user-token-alice",
    body: {
      tool: "top_gainers",
      tokenUsed: 0,
      durationMs: 33,
      status: "ok",
    },
  });
  assert.equal(status, 200);
  const parsedBody = body as { ok?: boolean; skipped?: string };
  assert.equal(parsedBody.ok, true);
  assert.equal(parsedBody.skipped, undefined);
  const lines = readLines();
  assert.equal(lines.length, 1);
  const row = JSON.parse(lines[0]);
  assert.equal(row.userId, "user_alice");
  assert.equal(row.tool, "top_gainers");
});

test("POST /api/mcp/record-call — anonymous caller short-circuits (200, skipped)", async () => {
  const { status, body } = await invokeRecordCall({
    body: {
      tool: "top_gainers",
      tokenUsed: 0,
      durationMs: 33,
      status: "ok",
    },
  });
  assert.equal(status, 200);
  const parsed = body as { ok?: boolean; skipped?: string };
  assert.equal(parsed.ok, true);
  assert.equal(parsed.skipped, "anonymous");
  assert.equal(readLines().length, 0);
});

test("POST /api/mcp/record-call — 400 on missing tool", async () => {
  const { status, body } = await invokeRecordCall({
    token: "test-user-token-alice",
    body: { durationMs: 10, status: "ok" },
  });
  assert.equal(status, 400);
  const parsed = body as { ok?: boolean; error?: string };
  assert.equal(parsed.ok, false);
  assert.match(parsed.error ?? "", /tool is required/);
});

test("POST /api/mcp/record-call — 400 on invalid status", async () => {
  const { status, body } = await invokeRecordCall({
    token: "test-user-token-alice",
    body: { tool: "top_gainers", durationMs: 10, status: "weird" },
  });
  assert.equal(status, 400);
  const parsed = body as { ok?: boolean; error?: string };
  assert.equal(parsed.ok, false);
  assert.match(parsed.error ?? "", /status must be/);
});

// ---------------------------------------------------------------------------
// Route — GET /api/mcp/usage
// ---------------------------------------------------------------------------

async function invokeUsageReport(options: {
  token?: string;
  month?: string;
}): Promise<{ status: number; body: unknown }> {
  const { GET } = await import("../../../app/api/mcp/usage/route");
  const headers: Record<string, string> = {};
  if (options.token) headers["x-user-token"] = options.token;
  const url = options.month
    ? `http://localhost/api/mcp/usage?month=${encodeURIComponent(options.month)}`
    : "http://localhost/api/mcp/usage";
  const req = new Request(url, { method: "GET", headers });
  const res: Response = await GET(req as never);
  const body = (await res.json()) as unknown;
  return { status: res.status, body };
}

test("GET /api/mcp/usage — 401 without auth", async () => {
  const { status, body } = await invokeUsageReport({
    token: "invalid-token-does-not-match",
  });
  assert.equal(status, 401);
  const parsed = body as { ok?: boolean };
  assert.equal(parsed.ok, false);
});

test("GET /api/mcp/usage — 200 with x-user-token, returns summary + records", async () => {
  // Seed 2 rows for alice in April 2026.
  const rows = [
    {
      id: "r1",
      userId: "user_alice",
      tool: "top_gainers",
      method: "tools/call",
      tokenUsed: 0,
      durationMs: 10,
      status: "ok",
      timestamp: "2026-04-01T10:00:00.000Z",
    },
    {
      id: "r2",
      userId: "user_alice",
      tool: "repo_profile_full",
      method: "tools/call",
      tokenUsed: 0,
      durationMs: 20,
      status: "ok",
      timestamp: "2026-04-10T10:00:00.000Z",
    },
  ];
  writeFileSync(
    USAGE_FILE,
    rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
    "utf8",
  );

  const { status, body } = await invokeUsageReport({
    token: "test-user-token-alice",
    month: "2026-04",
  });
  assert.equal(status, 200);
  const parsed = body as {
    ok?: boolean;
    month?: string;
    summary?: { totalCalls?: number; byTool?: Record<string, number> };
    records?: unknown[] | null;
  };
  assert.equal(parsed.ok, true);
  assert.equal(parsed.month, "2026-04");
  assert.equal(parsed.summary?.totalCalls, 2);
  assert.equal(parsed.summary?.byTool?.top_gainers, 1);
  assert.ok(Array.isArray(parsed.records));
  assert.equal(parsed.records?.length, 2);
});

test("GET /api/mcp/usage — 400 on malformed month", async () => {
  const { status, body } = await invokeUsageReport({
    token: "test-user-token-alice",
    month: "2026-4",
  });
  assert.equal(status, 400);
  const parsed = body as { ok?: boolean; code?: string };
  assert.equal(parsed.ok, false);
  assert.equal(parsed.code, "BAD_QUERY");
});

// ---------------------------------------------------------------------------
// Route — POST /api/cron/mcp/rotate-usage
// ---------------------------------------------------------------------------

async function invokeRotate(
  options: { auth?: string | null } = {},
): Promise<{ status: number; body: unknown }> {
  const { POST } = await import(
    "../../../app/api/cron/mcp/rotate-usage/route"
  );
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (options.auth !== null) {
    headers["authorization"] =
      options.auth ?? `Bearer ${process.env.CRON_SECRET}`;
  }
  const req = new Request("http://localhost/api/cron/mcp/rotate-usage", {
    method: "POST",
    headers,
    body: "{}",
  });
  const res: Response = await POST(req as never);
  const body = (await res.json()) as unknown;
  return { status: res.status, body };
}

test("POST /api/cron/mcp/rotate-usage — drops rows older than 365d", async () => {
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  // 2 "fresh" rows (50d ago, 364d ago) + 2 "old" rows (366d ago, 500d ago).
  const rows = [
    {
      id: "fresh1",
      userId: "user_alice",
      tool: "top_gainers",
      method: "tools/call",
      tokenUsed: 0,
      durationMs: 1,
      status: "ok",
      timestamp: new Date(now - 50 * oneDayMs).toISOString(),
    },
    {
      id: "fresh2",
      userId: "user_alice",
      tool: "top_gainers",
      method: "tools/call",
      tokenUsed: 0,
      durationMs: 1,
      status: "ok",
      timestamp: new Date(now - 364 * oneDayMs).toISOString(),
    },
    {
      id: "old1",
      userId: "user_alice",
      tool: "top_gainers",
      method: "tools/call",
      tokenUsed: 0,
      durationMs: 1,
      status: "ok",
      timestamp: new Date(now - 366 * oneDayMs).toISOString(),
    },
    {
      id: "old2",
      userId: "user_alice",
      tool: "top_gainers",
      method: "tools/call",
      tokenUsed: 0,
      durationMs: 1,
      status: "ok",
      timestamp: new Date(now - 500 * oneDayMs).toISOString(),
    },
  ];
  writeFileSync(
    USAGE_FILE,
    rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
    "utf8",
  );

  const { status, body } = await invokeRotate();
  assert.equal(status, 200);
  const parsed = body as {
    ok?: boolean;
    removed?: number;
    remaining?: number;
    retentionDays?: number;
  };
  assert.equal(parsed.ok, true);
  assert.equal(parsed.removed, 2);
  assert.equal(parsed.remaining, 2);
  assert.equal(parsed.retentionDays, 365);

  const ids = readLines().map((l) => JSON.parse(l).id as string);
  assert.deepEqual(ids.sort(), ["fresh1", "fresh2"]);
});

test("POST /api/cron/mcp/rotate-usage — 401 without cron auth", async () => {
  const { status, body } = await invokeRotate({ auth: "Bearer wrong-secret" });
  assert.equal(status, 401);
  const parsed = body as { ok?: boolean };
  assert.equal(parsed.ok, false);
});

test("POST /api/cron/mcp/rotate-usage — empty log → 0 removed", async () => {
  const { status, body } = await invokeRotate();
  assert.equal(status, 200);
  const parsed = body as { removed?: number; remaining?: number };
  assert.equal(parsed.removed, 0);
  assert.equal(parsed.remaining, 0);
});
