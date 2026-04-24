// Weekly digest tests — covers:
//   1. renderDigestEmail — snapshot-style assertions on stable inputs.
//   2. buildWeeklyDigests — user/email gating, breakout selection.
//   3. collectAlertsByUser — 7d cutoff, sort order.
//   4. ConsoleProvider — logs without throwing.
//   5. ResendProvider — issues correct fetch call (mock fetch).
//   6. POST /api/cron/digest/weekly — auth gate, DIGEST_ENABLED gate,
//      dryRun counts.
//
// Runner: `tsx --test` (matches the root test script in package.json).

import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Route-level tests import the Next.js route module, which pulls in
// `src/lib/bootstrap.ts → src/lib/env.ts`. Env is parsed at import
// time, so set required vars BEFORE we `import()` the route.
const TMP_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "ss-digest-"));
process.env.STARSCREENER_DATA_DIR = TMP_DATA_DIR;
process.env.STARSCREENER_PERSIST = "false";
process.env.CRON_SECRET = "test-cron-secret-0123456789abcdef";
// Keep GitHub token absent → derived repos returns the mock-seed surface,
// which is what the pipeline tests assume.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  renderDigestEmail,
  type DigestInput,
} from "../../email/render-digest";
import {
  buildWeeklyDigests,
  collectAlertsByUser,
  loadUserEmailMapFromEnv,
} from "../alerts/weekly-digest";
import { ConsoleProvider } from "../../email/providers/console";
import { ResendProvider } from "../../email/providers/resend";
import type { AlertEvent, AlertEventStore } from "../types";
import type { Repo } from "../../types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function mockRepo(overrides: Partial<Repo> & { fullName: string }): Repo {
  const [owner, name] = overrides.fullName.split("/");
  return {
    id: `${owner}--${name}`.toLowerCase(),
    fullName: overrides.fullName,
    name: name ?? "",
    owner: owner ?? "",
    ownerAvatarUrl: "",
    description: overrides.description ?? "A sample repo",
    url: `https://github.com/${overrides.fullName}`,
    language: "TypeScript",
    topics: [],
    categoryId: overrides.categoryId ?? "ai-agents",
    stars: overrides.stars ?? 5000,
    forks: 100,
    contributors: 10,
    openIssues: 5,
    lastCommitAt: "2026-04-20T00:00:00.000Z",
    lastReleaseAt: null,
    lastReleaseTag: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    starsDelta24h: 50,
    starsDelta7d: overrides.starsDelta7d ?? 300,
    starsDelta30d: 800,
    forksDelta7d: 5,
    contributorsDelta30d: 1,
    momentumScore: overrides.momentumScore ?? 60,
    movementStatus: overrides.movementStatus ?? "rising",
    rank: 10,
    categoryRank: 2,
    sparklineData: [],
    socialBuzzScore: 10,
    mentionCount24h: 2,
  };
}

function mockAlertEvent(overrides: Partial<AlertEvent> = {}): AlertEvent {
  return {
    id: overrides.id ?? "ev1",
    ruleId: overrides.ruleId ?? "rule1",
    repoId: overrides.repoId ?? "acme--rocket",
    userId: overrides.userId ?? "u_alice",
    trigger: overrides.trigger ?? "star_spike",
    title: overrides.title ?? "+250 stars in 24h",
    body: overrides.body ?? "Body",
    url: overrides.url ?? "/repo/acme/rocket",
    firedAt: overrides.firedAt ?? "2026-04-23T12:00:00.000Z",
    readAt: overrides.readAt ?? null,
    conditionValue: overrides.conditionValue ?? 250,
    threshold: overrides.threshold ?? 100,
  };
}

class MemEventStore implements AlertEventStore {
  events: AlertEvent[] = [];
  append(e: AlertEvent): void {
    this.events.push(e);
  }
  listForUser(userId: string, unreadOnly?: boolean): AlertEvent[] {
    return this.events.filter(
      (e) => e.userId === userId && (!unreadOnly || e.readAt === null),
    );
  }
  markRead(id: string): void {
    const e = this.events.find((x) => x.id === id);
    if (e) e.readAt = new Date().toISOString();
  }
}

// ---------------------------------------------------------------------------
// renderDigestEmail
// ---------------------------------------------------------------------------

function fixedDigestInput(): DigestInput {
  return {
    userId: "u_alice",
    userEmail: "alice@example.com",
    generatedAt: "2026-04-24T08:00:00.000Z",
    recentAlerts: [
      {
        id: "ev1",
        repoId: "acme--rocket",
        repoFullName: "acme/rocket",
        title: "+250 stars in 24h",
        trigger: "star_spike",
        firedAt: "2026-04-23T12:00:00.000Z",
      },
    ],
    topBreakouts: [
      {
        repoId: "cline--cline",
        fullName: "cline/cline",
        owner: "cline",
        name: "cline",
        description: "AI coding agent",
        stars: 45000,
        starsDelta7d: 2800,
        momentumScore: 88.4,
        categoryId: "ai-agents",
      },
    ],
  };
}

test("renderDigestEmail: subject reports alert + breakout counts", () => {
  const out = renderDigestEmail(fixedDigestInput());
  assert.equal(
    out.subject,
    "TrendingRepo weekly — 1 alert, 1 breakout",
  );
});

test("renderDigestEmail: plural counts in subject", () => {
  const input = fixedDigestInput();
  input.recentAlerts = [];
  input.topBreakouts = [
    input.topBreakouts[0]!,
    { ...input.topBreakouts[0]!, repoId: "b", fullName: "b/b" },
  ];
  const out = renderDigestEmail(input);
  assert.equal(
    out.subject,
    "TrendingRepo weekly — 0 alerts, 2 breakouts",
  );
});

test("renderDigestEmail: HTML contains repo name + breakout delta", () => {
  const out = renderDigestEmail(fixedDigestInput());
  assert.ok(out.html.includes("acme/rocket"));
  assert.ok(out.html.includes("cline/cline"));
  assert.ok(out.html.includes("+2.8k 7d"));
  assert.ok(out.html.includes("alice@example.com"));
});

test("renderDigestEmail: text has parity with HTML content", () => {
  const out = renderDigestEmail(fixedDigestInput());
  assert.ok(out.text.includes("TrendingRepo — Weekly Digest"));
  assert.ok(out.text.includes("acme/rocket"));
  assert.ok(out.text.includes("cline/cline"));
  assert.ok(out.text.includes("+2.8k 7d"));
  assert.ok(out.text.includes("alice@example.com"));
});

test("renderDigestEmail: HTML escapes hostile description text", () => {
  const input = fixedDigestInput();
  input.topBreakouts[0] = {
    ...input.topBreakouts[0]!,
    description: `<script>alert('x')</script>`,
  };
  const out = renderDigestEmail(input);
  assert.ok(!out.html.includes("<script>"));
  assert.ok(out.html.includes("&lt;script&gt;"));
});

test("renderDigestEmail: stable output for stable input (snapshot)", () => {
  const a = renderDigestEmail(fixedDigestInput());
  const b = renderDigestEmail(fixedDigestInput());
  assert.equal(a.html, b.html);
  assert.equal(a.text, b.text);
  assert.equal(a.subject, b.subject);
});

test("renderDigestEmail: shows empty-state copy when nothing to report", () => {
  const input = fixedDigestInput();
  input.recentAlerts = [];
  input.topBreakouts = [];
  const out = renderDigestEmail(input);
  assert.ok(out.html.includes("No alerts fired"));
  assert.ok(out.html.includes("No platform-wide breakouts"));
  assert.ok(out.text.includes("(none"));
});

// ---------------------------------------------------------------------------
// collectAlertsByUser
// ---------------------------------------------------------------------------

test("collectAlertsByUser: excludes events older than cutoff", () => {
  const store = new MemEventStore();
  const now = Date.parse("2026-04-24T08:00:00.000Z");
  const cutoff = now - 7 * 24 * 60 * 60 * 1000;
  store.append(
    mockAlertEvent({ id: "new", userId: "u1", firedAt: "2026-04-22T00:00:00.000Z" }),
  );
  store.append(
    mockAlertEvent({ id: "old", userId: "u1", firedAt: "2026-04-10T00:00:00.000Z" }),
  );
  const out = collectAlertsByUser(["u1"], store, cutoff);
  const events = out.get("u1") ?? [];
  assert.equal(events.length, 1);
  assert.equal(events[0]!.id, "new");
});

test("collectAlertsByUser: sorts newest-first", () => {
  const store = new MemEventStore();
  store.append(
    mockAlertEvent({ id: "a", userId: "u1", firedAt: "2026-04-20T00:00:00.000Z" }),
  );
  store.append(
    mockAlertEvent({ id: "b", userId: "u1", firedAt: "2026-04-23T00:00:00.000Z" }),
  );
  store.append(
    mockAlertEvent({ id: "c", userId: "u1", firedAt: "2026-04-21T00:00:00.000Z" }),
  );
  const out = collectAlertsByUser(["u1"], store, 0);
  const events = out.get("u1") ?? [];
  assert.deepEqual(
    events.map((e) => e.id),
    ["b", "c", "a"],
  );
});

// ---------------------------------------------------------------------------
// buildWeeklyDigests
// ---------------------------------------------------------------------------

test("buildWeeklyDigests: users without email are skipped and counted", () => {
  const repos = [
    mockRepo({ fullName: "acme/rocket", movementStatus: "breakout", momentumScore: 90 }),
  ];
  const out = buildWeeklyDigests({
    activeUserIds: new Set(["u_alice", "u_bob"]),
    alertsByUser: new Map(),
    repos,
    userEmails: new Map([["u_alice", "alice@example.com"]]),
    generatedAt: "2026-04-24T08:00:00.000Z",
  });
  assert.equal(out.digests.length, 1);
  assert.equal(out.digests[0]!.userId, "u_alice");
  assert.equal(out.skippedUsers, 1);
});

test("buildWeeklyDigests: empty digest (no alerts + no breakouts) dropped", () => {
  const out = buildWeeklyDigests({
    activeUserIds: new Set(["u_alice"]),
    alertsByUser: new Map(),
    repos: [],
    userEmails: new Map([["u_alice", "alice@example.com"]]),
    generatedAt: "2026-04-24T08:00:00.000Z",
  });
  assert.equal(out.digests.length, 0);
  assert.equal(out.skippedUsers, 0);
});

test("buildWeeklyDigests: breakouts sort above non-breakouts", () => {
  const repos = [
    mockRepo({ fullName: "a/a", movementStatus: "rising", momentumScore: 95 }),
    mockRepo({ fullName: "b/b", movementStatus: "breakout", momentumScore: 70 }),
    mockRepo({ fullName: "c/c", movementStatus: "breakout", momentumScore: 80 }),
  ];
  const out = buildWeeklyDigests({
    activeUserIds: new Set(["u_alice"]),
    alertsByUser: new Map([["u_alice", [mockAlertEvent({ userId: "u_alice" })]]]),
    repos,
    userEmails: new Map([["u_alice", "alice@example.com"]]),
    generatedAt: "2026-04-24T08:00:00.000Z",
  });
  assert.equal(out.digests.length, 1);
  const top = out.digests[0]!.topBreakouts;
  assert.equal(top[0]!.fullName, "c/c");
  assert.equal(top[1]!.fullName, "b/b");
  assert.equal(top[2]!.fullName, "a/a");
});

// ---------------------------------------------------------------------------
// loadUserEmailMapFromEnv
// ---------------------------------------------------------------------------

test("loadUserEmailMapFromEnv: empty when env unset", () => {
  delete process.env.DIGEST_USER_EMAILS_JSON;
  assert.equal(loadUserEmailMapFromEnv().size, 0);
});

test("loadUserEmailMapFromEnv: parses JSON", () => {
  process.env.DIGEST_USER_EMAILS_JSON = JSON.stringify({
    u_a: "a@x.com",
    u_b: "b@x.com",
  });
  const m = loadUserEmailMapFromEnv();
  assert.equal(m.size, 2);
  assert.equal(m.get("u_a"), "a@x.com");
  delete process.env.DIGEST_USER_EMAILS_JSON;
});

test("loadUserEmailMapFromEnv: rejects bad values", () => {
  process.env.DIGEST_USER_EMAILS_JSON = JSON.stringify({
    u_a: "",
    u_b: "not-an-email",
    u_c: "good@x.com",
  });
  const m = loadUserEmailMapFromEnv();
  assert.equal(m.size, 1);
  assert.equal(m.get("u_c"), "good@x.com");
  delete process.env.DIGEST_USER_EMAILS_JSON;
});

test("loadUserEmailMapFromEnv: tolerates garbage JSON", () => {
  process.env.DIGEST_USER_EMAILS_JSON = "not-json{";
  assert.equal(loadUserEmailMapFromEnv().size, 0);
  delete process.env.DIGEST_USER_EMAILS_JSON;
});

// ---------------------------------------------------------------------------
// ConsoleProvider
// ---------------------------------------------------------------------------

test("ConsoleProvider.send: logs structured JSON, returns ok", async () => {
  const provider = new ConsoleProvider();
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (line: string) => {
    lines.push(line);
  };
  try {
    const result = await provider.send({
      to: "alice@example.com",
      from: "digest@test",
      subject: "hi",
      html: "<b>hi</b>",
      text: "hi",
    });
    assert.equal(result.ok, true);
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]!);
    assert.equal(parsed.scope, "email:console");
    assert.equal(parsed.status, "logged");
  } finally {
    console.log = originalLog;
  }
});

// ---------------------------------------------------------------------------
// ResendProvider
// ---------------------------------------------------------------------------

test("ResendProvider: constructor rejects empty apiKey", () => {
  assert.throws(() => new ResendProvider(""), /apiKey/);
  assert.throws(() => new ResendProvider("   "), /apiKey/);
});

test("ResendProvider.send: POSTs to Resend API with Bearer auth", async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: typeof url === "string" ? url : url.toString(),
      init,
    });
    return new Response(JSON.stringify({ id: "re_12345" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const provider = new ResendProvider("re_test_key");
    const result = await provider.send({
      to: "alice@example.com",
      from: "digest@test.com",
      subject: "hi",
      html: "<b>hi</b>",
      text: "hi",
    });
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.id, "re_12345");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "https://api.resend.com/emails");
    const headers = calls[0]!.init?.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer re_test_key");
    assert.equal(headers["Content-Type"], "application/json");
    const body = JSON.parse(String(calls[0]!.init?.body));
    assert.equal(body.to, "alice@example.com");
    assert.equal(body.subject, "hi");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ResendProvider.send: returns error result on non-2xx", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("bad request", { status: 400 })) as typeof fetch;
  try {
    const provider = new ResendProvider("re_test_key");
    const result = await provider.send({
      to: "alice@example.com",
      from: "digest@test.com",
      subject: "hi",
      html: "x",
      text: "x",
    });
    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.error.includes("http_400"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ResendProvider.send: returns error result on network failure", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("ECONNREFUSED");
  }) as typeof fetch;
  try {
    const provider = new ResendProvider("re_test_key");
    const result = await provider.send({
      to: "alice@example.com",
      from: "digest@test.com",
      subject: "hi",
      html: "x",
      text: "x",
    });
    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.error.includes("network_error"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// POST /api/cron/digest/weekly
// ---------------------------------------------------------------------------

interface InvokeOptions {
  auth?: string | null;
  query?: Record<string, string>;
}

async function invokeRoute(opts: InvokeOptions = {}): Promise<Response> {
  const mod = await import(
    "../../../app/api/cron/digest/weekly/route"
  );
  const headers: Record<string, string> = {};
  if (opts.auth !== null && opts.auth !== undefined) {
    headers.authorization = opts.auth;
  }
  const qs = new URLSearchParams(opts.query ?? {}).toString();
  const url = `http://localhost/api/cron/digest/weekly${qs ? `?${qs}` : ""}`;
  return mod.POST(
    new Request(url, { method: "POST", headers }) as never,
  );
}

const GOOD_AUTH = "Bearer test-cron-secret-0123456789abcdef";

beforeEach(() => {
  delete process.env.DIGEST_ENABLED;
  delete process.env.DIGEST_USER_EMAILS_JSON;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
});

afterEach(() => {
  delete process.env.DIGEST_ENABLED;
  delete process.env.DIGEST_USER_EMAILS_JSON;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
});

test("POST /api/cron/digest/weekly: 401 without auth", async () => {
  process.env.DIGEST_ENABLED = "true";
  const res = await invokeRoute({ auth: null });
  assert.equal(res.status, 401);
});

test("POST /api/cron/digest/weekly: 401 with wrong auth", async () => {
  process.env.DIGEST_ENABLED = "true";
  const res = await invokeRoute({ auth: "Bearer nope" });
  assert.equal(res.status, 401);
});

test("POST /api/cron/digest/weekly: DIGEST_ENABLED unset → skipped", async () => {
  const res = await invokeRoute({ auth: GOOD_AUTH });
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    ok: boolean;
    skipped?: string;
    attempted: number;
    sent: number;
  };
  assert.equal(body.ok, true);
  assert.equal(body.skipped, "disabled");
  assert.equal(body.attempted, 0);
  assert.equal(body.sent, 0);
});

test("POST /api/cron/digest/weekly: DIGEST_ENABLED=false → skipped", async () => {
  process.env.DIGEST_ENABLED = "false";
  const res = await invokeRoute({ auth: GOOD_AUTH });
  const body = (await res.json()) as { skipped?: string };
  assert.equal(body.skipped, "disabled");
});

test("POST /api/cron/digest/weekly: ?dryRun=true → attempts but sent=0", async () => {
  process.env.DIGEST_ENABLED = "true";
  // No users configured → attempted=0 either way, but the route should
  // still return 200 with dryRun=true echoed back.
  const res = await invokeRoute({
    auth: GOOD_AUTH,
    query: { dryRun: "true" },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    ok: boolean;
    dryRun: boolean;
    sent: number;
  };
  assert.equal(body.ok, true);
  assert.equal(body.dryRun, true);
  assert.equal(body.sent, 0);
});
