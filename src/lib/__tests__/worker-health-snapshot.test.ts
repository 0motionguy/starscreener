import { test } from "node:test";
import assert from "node:assert/strict";

import { readWorkerHealthSnapshot } from "../worker-health-snapshot";
import type { RedisClientLike } from "../data-store";

class MapRedis implements RedisClientLike {
  constructor(private readonly values: Map<string, unknown>) {}

  async get(key: string): Promise<unknown> {
    return this.values.get(key) ?? null;
  }

  async set(): Promise<unknown> {
    return "OK";
  }

  async del(): Promise<number> {
    return 0;
  }
}

test("readWorkerHealthSnapshot marks missing active slugs unhealthy", async () => {
  const snapshot = await readWorkerHealthSnapshot(null, {
    specs: [{ slug: "recent-repos", fetcher: "recent-repos", cadenceMin: 60 }],
    disabledSpecs: [],
    nowMs: Date.parse("2026-06-01T00:00:00.000Z"),
  });

  assert.equal(snapshot.ok, false);
  assert.equal(snapshot.summary.missing, 1);
  assert.equal(snapshot.slugs[0]?.status, "missing");
});

test("readWorkerHealthSnapshot requires fresh meta and non-empty payload", async () => {
  const redis = new MapRedis(
    new Map<string, unknown>([
      ["ss:meta:v1:recent-repos", "2026-06-01T00:00:00.000Z"],
      [
        "ss:data:v1:recent-repos",
        JSON.stringify({ items: [{ fullName: "owner/repo" }] }),
      ],
    ]),
  );

  const snapshot = await readWorkerHealthSnapshot(redis, {
    specs: [{ slug: "recent-repos", fetcher: "recent-repos", cadenceMin: 60 }],
    disabledSpecs: [],
    nowMs: Date.parse("2026-06-01T00:30:00.000Z"),
  });

  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.summary.green, 1);
  assert.equal(snapshot.summary.emptyPayload, 0);
  assert.equal(snapshot.slugs[0]?.payloadRowCount, 1);
});
