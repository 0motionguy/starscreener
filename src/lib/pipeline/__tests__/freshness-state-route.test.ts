import assert from "node:assert/strict";
import { test } from "node:test";

test("freshness state route exposes expanded inventory with advisory blocking flags", async () => {
  const env = process.env as Record<string, string | undefined>;
  const previous = {
    CRON_SECRET: env.CRON_SECRET,
    NODE_ENV: env.NODE_ENV,
    REDIS_URL: env.REDIS_URL,
    UPSTASH_REDIS_REST_URL: env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: env.UPSTASH_REDIS_REST_TOKEN,
  };
  delete env.CRON_SECRET;
  delete env.REDIS_URL;
  delete env.UPSTASH_REDIS_REST_URL;
  delete env.UPSTASH_REDIS_REST_TOKEN;
  env.NODE_ENV = "test";

  try {
    const { _resetDataStoreForTests } = await import("../../data-store");
    _resetDataStoreForTests();
    const { GET } = await import("../../../app/api/cron/freshness/state/route");

    const response = await GET(new Request("http://localhost/api/cron/freshness/state") as never);
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      sources: Array<{ name: string; blocking?: boolean }>;
    };
    const byName = new Map(body.sources.map((source) => [source.name, source]));

    assert.ok(body.sources.length >= 45, `expected expanded inventory, got ${body.sources.length}`);
    assert.equal(byName.get("trending-repos")?.blocking, true);
    for (const source of [
      "hotness-snapshots",
      "mcp-dependents",
      "mcp-smithery-rank",
      "model-usage",
      "skill-install-snapshots",
    ]) {
      assert.equal(byName.get(source)?.blocking, false, `${source} should be advisory`);
    }
  } finally {
    if (previous.CRON_SECRET === undefined) delete env.CRON_SECRET;
    else env.CRON_SECRET = previous.CRON_SECRET;
    if (previous.NODE_ENV === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previous.NODE_ENV;
    if (previous.REDIS_URL === undefined) delete env.REDIS_URL;
    else env.REDIS_URL = previous.REDIS_URL;
    if (previous.UPSTASH_REDIS_REST_URL === undefined) delete env.UPSTASH_REDIS_REST_URL;
    else env.UPSTASH_REDIS_REST_URL = previous.UPSTASH_REDIS_REST_URL;
    if (previous.UPSTASH_REDIS_REST_TOKEN === undefined) delete env.UPSTASH_REDIS_REST_TOKEN;
    else env.UPSTASH_REDIS_REST_TOKEN = previous.UPSTASH_REDIS_REST_TOKEN;
    const { _resetDataStoreForTests } = await import("../../data-store");
    _resetDataStoreForTests();
  }
});
