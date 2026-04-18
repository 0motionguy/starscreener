// StarScreener — Email delivery tests (P0.1)

import { strict as assert } from "node:assert";
import { test, beforeEach, afterEach } from "node:test";

import type { AlertEvent } from "../types";
import type { Repo } from "../../types";
import { renderBreakoutAlert } from "../../email/templates/breakout-alert";
import {
  deliverAlertsViaEmail,
  __resetDedupForTests,
} from "../../email/deliver";

function makeRepo(partial: Partial<Repo> & { fullName: string }): Repo {
  const [owner, name] = partial.fullName.split("/");
  return {
    id: `${owner}--${name}`.toLowerCase(),
    fullName: partial.fullName,
    name: name ?? "",
    owner: owner ?? "",
    ownerAvatarUrl: "",
    description: partial.description ?? "",
    url: `https://github.com/${partial.fullName}`,
    language: null,
    topics: [],
    categoryId: partial.categoryId ?? "ai-agents",
    stars: partial.stars ?? 10000,
    forks: 500,
    contributors: 50,
    openIssues: 20,
    lastCommitAt: new Date().toISOString(),
    lastReleaseAt: null,
    lastReleaseTag: null,
    createdAt: new Date().toISOString(),
    starsDelta24h: partial.starsDelta24h ?? 250,
    starsDelta7d: partial.starsDelta7d ?? 900,
    starsDelta30d: 2000,
    forksDelta7d: 20,
    contributorsDelta30d: 2,
    momentumScore: partial.momentumScore ?? 72.5,
    movementStatus: "hot",
    rank: 4,
    categoryRank: 1,
    sparklineData: [],
    socialBuzzScore: 0,
    mentionCount24h: 0,
  };
}

function makeEvent(repoId: string, trigger: string): AlertEvent {
  return {
    id: `ev-${repoId}-${Date.now()}`,
    ruleId: "rule-1",
    repoId,
    userId: "operator",
    trigger: trigger as AlertEvent["trigger"],
    title: `${repoId} ${trigger}`,
    body: "test body",
    url: `https://starscreener-production.up.railway.app/repo/${repoId.replace("--", "/")}`,
    firedAt: new Date().toISOString(),
    readAt: null,
    conditionValue: 100,
    threshold: 50,
  };
}

// ---------------------------------------------------------------------------
// Template tests — pure functions, no env, no network
// ---------------------------------------------------------------------------

test("renderBreakoutAlert includes the repo fullName in subject", () => {
  const repo = makeRepo({ fullName: "cline/cline" });
  const event = makeEvent(repo.id, "breakout_detected");
  const rendered = renderBreakoutAlert(event, repo);
  assert.ok(rendered.subject.includes("cline/cline"));
  assert.ok(rendered.subject.includes("breakout"));
});

test("renderBreakoutAlert escapes HTML special chars in description", () => {
  const repo = makeRepo({
    fullName: "fake/xss",
    description: `<script>alert('x')</script>`,
  });
  const event = makeEvent(repo.id, "star_spike");
  const rendered = renderBreakoutAlert(event, repo);
  assert.ok(!rendered.html.includes("<script>"));
  assert.ok(rendered.html.includes("&lt;script&gt;"));
});

test("renderBreakoutAlert formats star numbers with k/M suffix", () => {
  const repo = makeRepo({ fullName: "ollama/ollama", stars: 169000 });
  const event = makeEvent(repo.id, "breakout_detected");
  const rendered = renderBreakoutAlert(event, repo);
  assert.ok(rendered.text.includes("169.0k"));
});

test("renderBreakoutAlert emits deterministic referenceId for dedup keying", () => {
  const repo = makeRepo({ fullName: "cline/cline" });
  const event: AlertEvent = {
    id: "e1",
    ruleId: "rule-1",
    repoId: repo.id,
    userId: "operator",
    trigger: "breakout_detected",
    title: "cline/cline breakout",
    body: "",
    url: "https://example.com",
    firedAt: "2026-04-18T14:00:00.000Z",
    readAt: null,
    conditionValue: 100,
    threshold: 50,
  };
  const r1 = renderBreakoutAlert(event, repo);
  const r2 = renderBreakoutAlert(event, repo);
  assert.equal(r1.referenceId, r2.referenceId);
});

// ---------------------------------------------------------------------------
// Delivery orchestrator tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  __resetDedupForTests();
});

afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.ALERT_EMAIL_TO;
});

test("deliverAlertsViaEmail no-ops when RESEND_API_KEY is missing", async () => {
  delete process.env.RESEND_API_KEY;
  process.env.ALERT_EMAIL_TO = "ops@example.com";
  const repo = makeRepo({ fullName: "cline/cline" });
  const event = makeEvent(repo.id, "breakout_detected");
  const stats = await deliverAlertsViaEmail(
    [event],
    new Map([[repo.id, repo]]),
  );
  assert.equal(stats.sent, 0);
  assert.equal(stats.skippedNoApiKey, 1);
});

test("deliverAlertsViaEmail no-ops when ALERT_EMAIL_TO is missing", async () => {
  process.env.RESEND_API_KEY = "re_fake";
  delete process.env.ALERT_EMAIL_TO;
  const repo = makeRepo({ fullName: "cline/cline" });
  const event = makeEvent(repo.id, "breakout_detected");
  const stats = await deliverAlertsViaEmail(
    [event],
    new Map([[repo.id, repo]]),
  );
  assert.equal(stats.sent, 0);
  assert.equal(stats.skippedNoRecipients, 1);
});

test("deliverAlertsViaEmail returns zero counts on empty input", async () => {
  process.env.RESEND_API_KEY = "re_fake";
  process.env.ALERT_EMAIL_TO = "ops@example.com";
  const stats = await deliverAlertsViaEmail([], new Map());
  assert.equal(stats.eventsConsidered, 0);
  assert.equal(stats.sent, 0);
});
