import assert from "node:assert/strict";
import { test } from "node:test";

test("freshness state route returns canonical typed envelope on internal failure", async () => {
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
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "freshness state unavailable",
      code: "FRESHNESS_STATE_FAILED",
    });
  } finally {
    testHooks.__resetInspectSourceForTests();
    if (previous.CRON_SECRET === undefined) delete env.CRON_SECRET;
    else env.CRON_SECRET = previous.CRON_SECRET;
    if (previous.NODE_ENV === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previous.NODE_ENV;
  }
});
