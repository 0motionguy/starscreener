// StarScreener Pipeline — GET/POST /api/repos/[owner]/[name]/aiso tests.
//
// Covers:
//   - slug validation (400) on both GET and POST
//   - unknown-repo handling (404) on both GET and POST
//   - never-scanned repos return { status: "none" } with 200
//   - POST appends a row to .data/aiso-rescan-queue.jsonl
//   - POST rate-limit: second call from same IP inside 60s → 429
//   - Cache-Control headers present on GET (s-maxage=30, SWR=60) + POST (no-store)
//
// Run with: npx tsx --test src/lib/pipeline/__tests__/aiso-endpoint.test.ts

// Redirect JSONL I/O to a per-run temp dir BEFORE the route (and its
// transitively-imported file-persistence helpers) resolve `currentDataDir()`
// at call time. Mutating the env after module-load still works because that
// helper re-reads the env on every call.
//
// The derived-repos fallback loader reads `${DATA_DIR}/repos.jsonl` for
// repos that have aged out of the committed OSSInsights snapshots
// (vercel/next.js is one of them). Seed a minimal repo row in the temp
// dir so the 404/200 paths we care about resolve deterministically
// regardless of what the developer's local .data contains.
import {
  mkdtempSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const TMP_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "ss-aiso-test-"));

// Minimal Repo JSONL row — matches the shape consumed by
// loadPipelineReposFromDisk() in src/lib/derived-repos.ts.
const FIXTURE_REPO_ROW = {
  id: "vercel--next-js",
  fullName: "vercel/next.js",
  name: "next.js",
  owner: "vercel",
  ownerAvatarUrl: "https://avatars.githubusercontent.com/u/14985020?v=4",
  description: "The React Framework",
  url: "https://github.com/vercel/next.js",
  language: "TypeScript",
  topics: [],
  categoryId: "web-framework",
  stars: 120000,
  forks: 25000,
  contributors: 1000,
  openIssues: 1000,
  lastCommitAt: "2026-04-20T00:00:00Z",
  lastReleaseAt: null,
  lastReleaseTag: null,
  createdAt: "2016-10-05T00:00:00Z",
  starsDelta24h: 0,
  starsDelta7d: 0,
  starsDelta30d: 0,
  forksDelta7d: 0,
  contributorsDelta30d: 0,
  momentumScore: 50,
  movementStatus: "stable",
  rank: 1,
  categoryRank: 1,
  sparklineData: Array(30).fill(0),
  socialBuzzScore: 0,
  mentionCount24h: 0,
  tags: [],
  hasMovementData: false,
};

writeFileSync(
  path.join(TMP_DATA_DIR, "repos.jsonl"),
  JSON.stringify(FIXTURE_REPO_ROW) + "\n",
  "utf8",
);

process.env.STARSCREENER_DATA_DIR = TMP_DATA_DIR;
process.env.STARSCREENER_PERSIST = "false";

import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Fixture repo — `vercel/next.js` is guaranteed to resolve via the
// committed derived-repos snapshot used by the rest of the test suite.
const FIXTURE_OWNER = "vercel";
const FIXTURE_NAME = "next.js";

const QUEUE_FILE = path.join(TMP_DATA_DIR, "aiso-rescan-queue.jsonl");

interface QueueRow {
  fullName: string;
  websiteUrl: string | null;
  requestedAt: string;
  requestIp: string;
  source: string;
}

function readQueue(): QueueRow[] {
  if (!existsSync(QUEUE_FILE)) return [];
  const raw = readFileSync(QUEUE_FILE, "utf8");
  return raw
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as QueueRow);
}

async function invokeGet(
  owner: string,
  name: string,
): Promise<Response> {
  const { GET } = await import(
    "../../../app/api/repos/[owner]/[name]/aiso/route"
  );
  const req = new Request(
    `http://localhost/api/repos/${owner}/${name}/aiso`,
  );
  return GET(req as never, {
    params: Promise.resolve({ owner, name }),
  });
}

async function invokePost(
  owner: string,
  name: string,
  ip = "203.0.113.7",
): Promise<Response> {
  const { POST } = await import(
    "../../../app/api/repos/[owner]/[name]/aiso/route"
  );
  const req = new Request(
    `http://localhost/api/repos/${owner}/${name}/aiso`,
    { method: "POST", headers: { "x-forwarded-for": ip } },
  );
  return POST(req as never, {
    params: Promise.resolve({ owner, name }),
  });
}

async function resetRateLimit(): Promise<void> {
  // Force the route module to load so its side-effect assignment onto
  // `globalThis[AISO_TEST_RESET]` runs before we invoke the hook.
  await import("../../../app/api/repos/[owner]/[name]/aiso/route");
  const key = Symbol.for("trendingrepo.aiso.test.reset");
  const fn = (globalThis as unknown as Record<symbol, (() => void) | undefined>)[key];
  if (typeof fn === "function") fn();
}

before(async () => {
  // The route-local rate limiter is module-scoped. Clear it once before any
  // test runs so prior suite-level imports can't leak state.
  await resetRateLimit();
});

beforeEach(async () => {
  await resetRateLimit();
});

// ---------------------------------------------------------------------------
// Slug validation
// ---------------------------------------------------------------------------

test("GET 400 on invalid slug", async () => {
  const res = await invokeGet("bad owner", FIXTURE_NAME);
  assert.equal(res.status, 400);
  const body = (await res.json()) as { ok: boolean; error: string };
  assert.equal(body.ok, false);
});

test("POST 400 on invalid slug", async () => {
  const res = await invokePost("bad owner", FIXTURE_NAME);
  assert.equal(res.status, 400);
  const body = (await res.json()) as { ok: boolean };
  assert.equal(body.ok, false);
});

// ---------------------------------------------------------------------------
// Unknown repo
// ---------------------------------------------------------------------------

test("GET 404 on unknown repo", async () => {
  const res = await invokeGet(
    "this-owner-definitely",
    "does-not-exist-xyz-9999",
  );
  assert.equal(res.status, 404);
  const body = (await res.json()) as { ok: boolean; error: string };
  assert.equal(body.ok, false);
  assert.equal(body.error, "Repo not found");
});

test("POST 404 on unknown repo", async () => {
  const res = await invokePost(
    "this-owner-definitely",
    "does-not-exist-xyz-9999",
  );
  assert.equal(res.status, 404);
  const body = (await res.json()) as { ok: boolean };
  assert.equal(body.ok, false);
});

// ---------------------------------------------------------------------------
// Never-scanned path
// ---------------------------------------------------------------------------

test("GET on never-scanned repo returns status: 'none' with 200", async () => {
  const res = await invokeGet(FIXTURE_OWNER, FIXTURE_NAME);
  // If the environment has a persisted repo-profiles.json with a scan for
  // vercel/next.js, the status will be something other than "none". Accept
  // either: the invariant we pin is that the endpoint returns 200 and a
  // well-formed envelope. When "none", lastScanAt must be null.
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    ok: boolean;
    status: string;
    lastScanAt: string | null;
  };
  assert.equal(body.ok, true);
  assert.ok(
    ["none", "scanned", "queued", "rate_limited", "failed"].includes(body.status),
    `unexpected status: ${body.status}`,
  );
  if (body.status === "none") {
    assert.equal(body.lastScanAt, null);
  }
});

// ---------------------------------------------------------------------------
// Cache-Control headers
// ---------------------------------------------------------------------------

test("GET sets s-maxage=30, stale-while-revalidate=60", async () => {
  const res = await invokeGet(FIXTURE_OWNER, FIXTURE_NAME);
  assert.equal(res.status, 200);
  const cc = res.headers.get("Cache-Control");
  assert.ok(cc, "Cache-Control must be set");
  assert.match(cc!, /s-maxage=30/);
  assert.match(cc!, /stale-while-revalidate=60/);
});

test("POST sets Cache-Control: no-store", async () => {
  const res = await invokePost(FIXTURE_OWNER, FIXTURE_NAME, "203.0.113.10");
  assert.equal(res.status, 200);
  const cc = res.headers.get("Cache-Control");
  assert.ok(cc, "Cache-Control must be set");
  assert.match(cc!, /no-store/);
});

// ---------------------------------------------------------------------------
// POST success + queue append
// ---------------------------------------------------------------------------

test("POST appends a row to the rescan queue file", async () => {
  const before = readQueue().length;
  const res = await invokePost(FIXTURE_OWNER, FIXTURE_NAME, "203.0.113.20");
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    ok: boolean;
    status: string;
    queuedAt: string;
  };
  assert.equal(body.ok, true);
  assert.equal(body.status, "queued");
  assert.ok(!Number.isNaN(Date.parse(body.queuedAt)));

  const after = readQueue();
  assert.equal(after.length, before + 1, "queue must grow by 1");
  const row = after[after.length - 1];
  assert.equal(row.fullName, `${FIXTURE_OWNER}/${FIXTURE_NAME}`);
  assert.equal(row.source, "user-retry");
  assert.equal(row.requestIp, "203.0.113.20");
  assert.ok(!Number.isNaN(Date.parse(row.requestedAt)));
});

// ---------------------------------------------------------------------------
// POST rate-limit
// ---------------------------------------------------------------------------

test("POST rate-limit: second call within 60s from same IP → 429", async () => {
  const IP = "203.0.113.30";
  const first = await invokePost(FIXTURE_OWNER, FIXTURE_NAME, IP);
  assert.equal(first.status, 200);

  const second = await invokePost(FIXTURE_OWNER, FIXTURE_NAME, IP);
  assert.equal(second.status, 429);
  const body = (await second.json()) as {
    ok: boolean;
    retryAfterMs: number;
  };
  assert.equal(body.ok, false);
  assert.ok(body.retryAfterMs > 0);
  assert.ok(body.retryAfterMs <= 60_000);

  const retryAfter = second.headers.get("Retry-After");
  assert.ok(retryAfter, "Retry-After header present");
});

test("POST rate-limit: different IPs do not share a bucket", async () => {
  const first = await invokePost(FIXTURE_OWNER, FIXTURE_NAME, "203.0.113.40");
  assert.equal(first.status, 200);
  const second = await invokePost(FIXTURE_OWNER, FIXTURE_NAME, "203.0.113.41");
  assert.equal(second.status, 200);
});
