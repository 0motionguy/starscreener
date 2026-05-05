process.env.STARSCREENER_PERSIST = "false";

import { test, before } from "node:test";
import assert from "node:assert/strict";
import type { RepoMention } from "../types";
import { mentionStore } from "../storage/singleton";
import { makeMention } from "../../../test-utils/factories";
import { ensurePipelineRepoJsonlFixture } from "./fixtures/pipeline-repo-fixtures";

ensurePipelineRepoJsonlFixture();

const FIXTURE_OWNER = "vercel";
const FIXTURE_NAME = "next.js";
const FIXTURE_FULL_NAME = `${FIXTURE_OWNER}/${FIXTURE_NAME}`;
const FIXTURE_REPO_ID = "vercel--next-js";

function mkMention(
  overrides: Partial<RepoMention> & { id: string; postedAt: string; platform: RepoMention["platform"] },
): RepoMention {
  return makeMention({
    repoId: FIXTURE_REPO_ID,
    url: `https://example.com/${overrides.id}`,
    discoveredAt: overrides.postedAt,
    ...overrides,
  });
}

function buildSeedMentions(): RepoMention[] {
  return [
    mkMention({ id: "hn-1", platform: "hackernews", postedAt: "2026-04-22T12:00:00.000Z", content: "hn title" }),
    mkMention({ id: "r-1", platform: "reddit", postedAt: "2026-04-22T11:00:00.000Z", content: "reddit title" }),
    mkMention({ id: "tw-1", platform: "twitter", postedAt: "2026-04-22T10:00:00.000Z", content: "tweet title" }),
    mkMention({ id: "bs-1", platform: "bluesky", postedAt: "2026-04-21T10:00:00.000Z", content: "bsky title" }),
  ];
}

function clearMentionStore(): void {
  const store = mentionStore as unknown as { byRepo: Map<string, unknown>; aggregates: Map<string, unknown> };
  store.byRepo.clear();
  store.aggregates.clear();
}

before(() => {
  clearMentionStore();
  for (const m of buildSeedMentions()) mentionStore.append(m);
});

async function invokeRoute(owner: string, name: string, query = ""): Promise<Response> {
  const { GET } = await import("../../../app/api/repos/[owner]/[name]/mentions/route");
  const req = new Request(`http://localhost/api/repos/${owner}/${name}/mentions${query}`);
  return GET(req as never, { params: Promise.resolve({ owner, name }) });
}

test("400 on invalid source", async () => {
  const res = await invokeRoute(FIXTURE_OWNER, FIXTURE_NAME, "?source=bad");
  assert.equal(res.status, 400);
});

test("200 returns unified contract shape", async () => {
  const res = await invokeRoute(FIXTURE_OWNER, FIXTURE_NAME, "?source=all&since=all&limit=20");
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    items: Array<{ id: string; source: string; url: string; title: string; snippet: string; author: string; occurredAt: string; repoFullName: string }>;
    totalCount: number;
    sourcesBreakdown: Record<string, number>;
    nextAfter?: string | null;
  };
  assert.ok(Array.isArray(body.items));
  assert.equal(typeof body.totalCount, "number");
  assert.equal(typeof body.sourcesBreakdown, "object");
  for (const item of body.items) {
    assert.equal(item.repoFullName, FIXTURE_FULL_NAME);
    assert.ok(item.id.length > 0);
    assert.ok(item.source.length > 0);
    assert.ok(item.url.length > 0);
    assert.ok(item.occurredAt.length > 0);
  }
});

test("source=hn filters to hn only", async () => {
  const res = await invokeRoute(FIXTURE_OWNER, FIXTURE_NAME, "?source=hn&since=all&limit=20");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { items: Array<{ source: string }> };
  for (const item of body.items) assert.equal(item.source, "hn");
});

test("since=24h narrows or equals all-time count", async () => {
  const allRes = await invokeRoute(FIXTURE_OWNER, FIXTURE_NAME, "?since=all&limit=50");
  const dayRes = await invokeRoute(FIXTURE_OWNER, FIXTURE_NAME, "?since=24h&limit=50");
  const all = (await allRes.json()) as { totalCount: number };
  const day = (await dayRes.json()) as { totalCount: number };
  assert.ok(day.totalCount <= all.totalCount);
});

test("after cursor paginates by id", async () => {
  const firstRes = await invokeRoute(FIXTURE_OWNER, FIXTURE_NAME, "?source=all&since=all&limit=2");
  const first = (await firstRes.json()) as { items: Array<{ id: string }>; nextAfter?: string | null };
  assert.equal(first.items.length, 2);
  assert.ok(first.nextAfter);

  const secondRes = await invokeRoute(
    FIXTURE_OWNER,
    FIXTURE_NAME,
    `?source=all&since=all&limit=2&after=${encodeURIComponent(first.nextAfter as string)}`,
  );
  const second = (await secondRes.json()) as { items: Array<{ id: string }> };
  const ids = new Set([...first.items, ...second.items].map((x) => x.id));
  assert.equal(ids.size, first.items.length + second.items.length);
});

test("Cache-Control header uses 5-minute caching", async () => {
  const res = await invokeRoute(FIXTURE_OWNER, FIXTURE_NAME);
  const cc = res.headers.get("Cache-Control") ?? "";
  assert.match(cc, /s-maxage=300/);
});