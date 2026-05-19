import assert from "node:assert/strict";
import { test } from "node:test";

test("admin overview exposes repo-profile scan backlog status", async () => {
  const env = process.env as Record<string, string | undefined>;
  const previous = {
    ADMIN_TOKEN: env.ADMIN_TOKEN,
    NODE_ENV: env.NODE_ENV,
    REDIS_URL: env.REDIS_URL,
    UPSTASH_REDIS_REST_URL: env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: env.UPSTASH_REDIS_REST_TOKEN,
  };
  env.ADMIN_TOKEN = "test-admin-token";
  env.NODE_ENV = "test";
  delete env.REDIS_URL;
  delete env.UPSTASH_REDIS_REST_URL;
  delete env.UPSTASH_REDIS_REST_TOKEN;

  try {
    const { _resetDataStoreForTests } = await import("../../data-store");
    _resetDataStoreForTests();
    const { GET } = await import("../../../app/api/admin/overview/route");

    const response = await GET(
      new Request("http://localhost/api/admin/overview", {
        headers: { authorization: "Bearer test-admin-token" },
      }) as never,
    );

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      repoProfileStatus?: {
        counts: { actionableBacklog: number; withAiso: number };
        budget: { remainingToday: number | null; recentAisoSubmissions24h: number };
        backlogPreview: Array<{ fullName: string; status: string }>;
      };
    };
    assert.ok(body.repoProfileStatus, "repoProfileStatus should be present");
    assert.equal(typeof body.repoProfileStatus.counts.actionableBacklog, "number");
    assert.equal(typeof body.repoProfileStatus.counts.withAiso, "number");
    assert.equal(
      typeof body.repoProfileStatus.budget.recentAisoSubmissions24h,
      "number",
    );
    assert.ok(Array.isArray(body.repoProfileStatus.backlogPreview));
  } finally {
    if (previous.ADMIN_TOKEN === undefined) delete env.ADMIN_TOKEN;
    else env.ADMIN_TOKEN = previous.ADMIN_TOKEN;
    if (previous.NODE_ENV === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previous.NODE_ENV;
    if (previous.REDIS_URL === undefined) delete env.REDIS_URL;
    else env.REDIS_URL = previous.REDIS_URL;
    if (previous.UPSTASH_REDIS_REST_URL === undefined) {
      delete env.UPSTASH_REDIS_REST_URL;
    } else {
      env.UPSTASH_REDIS_REST_URL = previous.UPSTASH_REDIS_REST_URL;
    }
    if (previous.UPSTASH_REDIS_REST_TOKEN === undefined) {
      delete env.UPSTASH_REDIS_REST_TOKEN;
    } else {
      env.UPSTASH_REDIS_REST_TOKEN = previous.UPSTASH_REDIS_REST_TOKEN;
    }
    const { _resetDataStoreForTests } = await import("../../data-store");
    _resetDataStoreForTests();
  }
});
