process.env.STARSCREENER_PERSIST = "false";

import { before, test } from "node:test";
import assert from "node:assert/strict";

import type { RepoMention } from "../types";
import { mentionStore } from "../storage/singleton";
import { makeMention } from "../../../test-utils/factories";

function clearMentionStore(): void {
  const store = mentionStore as unknown as {
    byRepo: Map<string, unknown>;
    aggregates: Map<string, unknown>;
  };
  store.byRepo.clear();
  store.aggregates.clear();
}

function mkMention(
  overrides: Partial<RepoMention> & { id: string; postedAt: string; platform: RepoMention["platform"] },
): RepoMention {
  return makeMention({
    repoId: overrides.repoId ?? "repo-1",
    url: `https://example.com/${overrides.id}`,
    discoveredAt: overrides.postedAt,
    ...overrides,
  });
}

before(() => {
  clearMentionStore();
  mentionStore.append(
    mkMention({
      id: "hn-recent",
      repoId: "repo-hn",
      platform: "hackernews",
      postedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    }),
  );
  mentionStore.append(
    mkMention({
      id: "hn-old",
      repoId: "repo-hn",
      platform: "hackernews",
      postedAt: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(),
    }),
  );
  mentionStore.append(
    mkMention({
      id: "reddit-recent",
      repoId: "repo-rd",
      platform: "reddit",
      postedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    }),
  );
});

async function invoke(query = ""): Promise<Response> {
  const { GET } = await import("../../../app/api/mentions/route");
  return GET(new Request(`http://localhost/api/mentions${query}`) as never);
}

test("GET /api/mentions?source=hn&since=24h returns only recent hackernews rows", async () => {
  const res = await invoke("?source=hn&since=24h");
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    ok: boolean;
    count: number;
    filters: { source: string | null; since: string | null };
    items: RepoMention[];
  };

  assert.equal(body.ok, true);
  assert.equal(body.filters.source, "hackernews");
  assert.equal(body.filters.since, "24h");
  assert.equal(body.count, 1);
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].id, "hn-recent");
  assert.equal(body.items[0].platform, "hackernews");
});

test("GET /api/mentions rejects invalid since", async () => {
  const res = await invoke("?source=hn&since=bad");
  assert.equal(res.status, 400);
  const body = (await res.json()) as { ok: boolean; code?: string };
  assert.equal(body.ok, false);
  assert.equal(body.code, "invalid_since");
});
