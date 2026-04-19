// StarScreener — top_gainers agent-tool tests.

import { beforeEach, test } from "node:test";
import { strict as assert } from "node:assert";

import { topGainers } from "../top-gainers";
import { ParamError } from "../errors";
import { clearRepoStore, makeRepo, seedRepos } from "./fixtures";

beforeEach(() => {
  clearRepoStore();
});

test("top_gainers returns repos sorted by weekly star delta desc", () => {
  seedRepos([
    makeRepo({ id: "a--one", starsDelta7d: 100 }),
    makeRepo({ id: "b--two", starsDelta7d: 500 }),
    makeRepo({ id: "c--three", starsDelta7d: 250 }),
  ]);

  const out = topGainers({ limit: 3 });
  assert.equal(out.window, "7d");
  assert.equal(out.count, 3);
  assert.deepEqual(
    out.repos.map((r) => r.full_name),
    ["b/two", "c/three", "a/one"],
  );
});

test("top_gainers window=24h switches to starsDelta24h sort", () => {
  seedRepos([
    makeRepo({ id: "a--one", starsDelta7d: 1, starsDelta24h: 50 }),
    makeRepo({ id: "b--two", starsDelta7d: 999, starsDelta24h: 10 }),
  ]);

  const out = topGainers({ window: "24h", limit: 2 });
  assert.equal(out.window, "24h");
  assert.equal(out.repos[0].full_name, "a/one");
});

test("top_gainers defaults to limit=10 and clamps to 50", () => {
  seedRepos(
    Array.from({ length: 60 }, (_, i) =>
      makeRepo({ id: `owner--r${i}`, starsDelta7d: 60 - i }),
    ),
  );

  const defaultOut = topGainers({});
  assert.equal(defaultOut.repos.length, 10);

  const clamped = topGainers({ limit: 9999 });
  assert.equal(clamped.repos.length, 50);
});

test("top_gainers language filter is case-insensitive exact-match", () => {
  seedRepos([
    makeRepo({ id: "a--ts", language: "TypeScript", starsDelta7d: 10 }),
    makeRepo({ id: "b--py", language: "Python", starsDelta7d: 20 }),
    makeRepo({ id: "c--ts2", language: "typescript", starsDelta7d: 5 }),
    makeRepo({ id: "d--go", language: "Go", starsDelta7d: 30 }),
  ]);

  const out = topGainers({ language: "typescript", limit: 10 });
  assert.equal(out.count, 2);
  assert.deepEqual(
    out.repos.map((r) => r.full_name).sort(),
    ["a/ts", "c/ts2"],
  );
});

test("top_gainers excludes deleted repos", () => {
  seedRepos([
    makeRepo({ id: "a--live", starsDelta7d: 100 }),
    makeRepo({ id: "b--gone", starsDelta7d: 999, deleted: true }),
  ]);

  const out = topGainers({ limit: 10 });
  assert.equal(out.count, 1);
  assert.equal(out.repos[0].full_name, "a/live");
});

test("top_gainers rejects invalid params", () => {
  assert.throws(() => topGainers(null), ParamError);
  assert.throws(() => topGainers({ limit: -3 }), ParamError);
  assert.throws(() => topGainers({ limit: "10" }), ParamError);
  assert.throws(() => topGainers({ window: "yearly" }), ParamError);
  assert.throws(() => topGainers({ language: "" }), ParamError);
});

test("top_gainers returns empty list when index is empty (no throw)", () => {
  const out = topGainers({ limit: 5 });
  assert.equal(out.count, 0);
  assert.deepEqual(out.repos, []);
});
