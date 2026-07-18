import assert from "node:assert/strict";
import { test } from "node:test";

import type { DataStore } from "../data-store";
import type { Repo } from "../types";

function patchExport(path: string, name: string, value: unknown): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(path) as Record<string, unknown>;
  const cached = require.cache[require.resolve(path)];
  if (cached) cached.exports = { ...mod, [name]: value };
}

test("slot D returns no-candidates when every repo has a zero discovery score", async () => {
  const store: DataStore = {
    async read<T>() {
      return { data: { posts: [] } as T, source: "redis", ageMs: 0, fresh: true };
    },
    async readMany() {
      return [];
    },
    async write() {},
    async writtenAt() {
      return null;
    },
    async reset() {},
    redisClient() {
      return null;
    },
  };
  const repos = [
    {
      id: "acme/established",
      fullName: "acme/established",
      stars: 100_000,
      starsDelta24h: 500,
      lastCommitAt: "2026-07-18T00:00:00.000Z",
    } as Repo,
  ];
  patchExport(require.resolve("../data-store"), "getDataStore", () => store);
  patchExport(require.resolve("../derived-repos"), "getDerivedRepos", () => repos);

  const { proposeTrendingPost } = await import("../twitter/outbound/trending-runner");
  const proposal = await proposeTrendingPost(Date.parse("2026-07-18T04:47:00Z"), "D");

  assert.deepEqual(proposal, { post: false, reason: "no-candidates" });
});
