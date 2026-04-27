import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildDataReposResponse,
  buildDataSnapshotResponse,
  DataApiQueryError,
} from "../../api/data-api";
import type { Repo } from "../../types";

process.env.USER_TOKENS_JSON = JSON.stringify({
  "data-api-token": "user_data_api",
});

function repo(overrides: Partial<Repo> & { fullName: string }): Repo {
  const { fullName, ...rest } = overrides;
  const [owner, name] = fullName.split("/");
  return {
    id: fullName.toLowerCase().replace("/", "--").replaceAll(".", "-"),
    fullName,
    owner,
    name,
    ownerAvatarUrl: `https://github.com/${owner}.png`,
    description: `${fullName} description`,
    url: `https://github.com/${fullName}`,
    language: "TypeScript",
    topics: [],
    categoryId: "ai-agents",
    stars: 100,
    forks: 10,
    contributors: 5,
    openIssues: 2,
    lastCommitAt: "2026-04-20T00:00:00.000Z",
    lastReleaseAt: null,
    lastReleaseTag: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    starsDelta24h: 0,
    starsDelta7d: 0,
    starsDelta30d: 0,
    forksDelta7d: 0,
    contributorsDelta30d: 0,
    momentumScore: 50,
    movementStatus: "stable",
    rank: 1,
    categoryRank: 1,
    sparklineData: [100],
    socialBuzzScore: 0,
    mentionCount24h: 0,
    ...rest,
  };
}

const FIXTURE_REPOS: Repo[] = [
  repo({
    fullName: "alpha/rocket",
    language: "TypeScript",
    topics: ["agents", "mcp"],
    tags: ["agent"],
    categoryId: "ai-agents",
    stars: 900,
    starsDelta24h: 80,
    starsDelta7d: 200,
    starsDelta30d: 700,
    momentumScore: 96,
    movementStatus: "breakout",
    rank: 1,
  }),
  repo({
    fullName: "beta/store",
    language: "Rust",
    topics: ["database"],
    tags: ["database"],
    categoryId: "databases",
    stars: 1200,
    starsDelta24h: 20,
    starsDelta7d: 300,
    starsDelta30d: 500,
    momentumScore: 82,
    movementStatus: "hot",
    rank: 2,
  }),
  repo({
    fullName: "gamma/ui",
    language: "TypeScript",
    topics: ["react"],
    tags: ["frontend"],
    categoryId: "web-frameworks",
    stars: 400,
    starsDelta24h: 5,
    starsDelta7d: 20,
    starsDelta30d: 90,
    momentumScore: 61,
    movementStatus: "stable",
    rank: 3,
  }),
];

test("buildDataReposResponse filters, sorts, paginates, and projects fields", () => {
  const response = buildDataReposResponse(
    new URLSearchParams({
      window: "24h",
      language: "TypeScript",
      sort: "delta",
      limit: "1",
      fields: "fullName,starsDelta24h,momentumScore",
    }),
    { repos: FIXTURE_REPOS, now: "2026-04-26T00:00:00.000Z" },
  );

  assert.equal(response.ok, true);
  assert.equal(response.v, 1);
  assert.equal(response.meta.total, 2);
  assert.equal(response.meta.count, 1);
  assert.equal(response.meta.nextOffset, 1);
  assert.deepEqual(response.meta.fields, [
    "fullName",
    "starsDelta24h",
    "momentumScore",
  ]);
  assert.deepEqual(response.data, [
    {
      fullName: "alpha/rocket",
      starsDelta24h: 80,
      momentumScore: 96,
    },
  ]);
});

test("buildDataReposResponse rejects unknown fields", () => {
  assert.throws(
    () =>
      buildDataReposResponse(
        new URLSearchParams({ fields: "fullName,secretSauce" }),
        { repos: FIXTURE_REPOS },
      ),
    (err: unknown) =>
      err instanceof DataApiQueryError &&
      err.status === 400 &&
      err.code === "BAD_FIELD",
  );
});

test("buildDataSnapshotResponse returns dataset summaries", () => {
  const response = buildDataSnapshotResponse({
    repos: FIXTURE_REPOS,
    now: "2026-04-26T00:00:00.000Z",
    topLimit: 2,
  });

  assert.equal(response.ok, true);
  assert.equal(response.v, 1);
  assert.equal(response.summary.totalRepos, 3);
  assert.deepEqual(response.summary.byLanguage, {
    Rust: 1,
    TypeScript: 2,
  });
  assert.deepEqual(response.summary.byMovementStatus, {
    breakout: 1,
    hot: 1,
    stable: 1,
  });
  assert.deepEqual(
    response.topRepos.map((item) => item.fullName),
    ["alpha/rocket", "beta/store"],
  );
});

test("GET /api/data/repos requires auth", async () => {
  const { GET } = await import("../../../app/api/data/repos/route");
  const req = new Request("http://localhost/api/data/repos?limit=1");
  const res = await GET(req as never);
  const body = (await res.json()) as Record<string, unknown>;

  assert.equal(res.status, 401);
  assert.equal(body.ok, false);
});

test("GET /api/data/repos returns a versioned authenticated envelope", async () => {
  const { GET } = await import("../../../app/api/data/repos/route");
  const req = new Request(
    "http://localhost/api/data/repos?limit=1&fields=fullName,stars",
    { headers: { "x-user-token": "data-api-token" } },
  );
  const res = await GET(req as never);
  const body = (await res.json()) as {
    ok: boolean;
    v: number;
    data: Array<Record<string, unknown>>;
    meta: { count: number; fields: string[] };
  };

  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.v, 1);
  assert.ok(body.meta.count <= 1);
  assert.deepEqual(body.meta.fields, ["fullName", "stars"]);
  if (body.data.length > 0) {
    assert.deepEqual(Object.keys(body.data[0]).sort(), ["fullName", "stars"]);
  }
});

test("GET /api/data/snapshot returns a versioned authenticated summary", async () => {
  const { GET } = await import("../../../app/api/data/snapshot/route");
  const req = new Request("http://localhost/api/data/snapshot?top=1", {
    headers: { "x-user-token": "data-api-token" },
  });
  const res = await GET(req as never);
  const body = (await res.json()) as {
    ok: boolean;
    v: number;
    summary: { totalRepos: number };
    topRepos: Array<Record<string, unknown>>;
  };

  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.v, 1);
  assert.ok(body.summary.totalRepos >= body.topRepos.length);
  assert.ok(body.topRepos.length <= 1);
});
