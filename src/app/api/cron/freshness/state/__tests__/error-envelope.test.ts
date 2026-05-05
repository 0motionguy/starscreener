import assert from "node:assert/strict";
import { test } from "node:test";

test("freshness state route degrades to DEAD entries when source inspection throws", async () => {
  const env = process.env as Record<string, string | undefined>;
  const previous = {
    CRON_SECRET: env.CRON_SECRET,
    NODE_ENV: env.NODE_ENV,
  };
  delete env.CRON_SECRET;
  env.NODE_ENV = "test";

  const route = await import("../route");
  const testHooks = await import("../_test-hooks");
  testHooks.__setInspectSourceForTests(async () => {
    throw new Error("forced freshness failure");
  });

  try {
    const response = await route.GET(
      new Request("http://localhost/api/cron/freshness/state") as never,
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      sources: Array<{ status: string }>;
      summary: { dead: number };
    };
    assert.ok(body.sources.length > 0);
    assert.ok(body.sources.every((source) => source.status === "DEAD"));
    assert.equal(body.summary.dead, body.sources.length);
  } finally {
    testHooks.__resetInspectSourceForTests();
    if (previous.CRON_SECRET === undefined) delete env.CRON_SECRET;
    else env.CRON_SECRET = previous.CRON_SECRET;
    if (previous.NODE_ENV === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previous.NODE_ENV;
  }
});
