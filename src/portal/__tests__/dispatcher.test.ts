// StarScreener — Portal /portal/call dispatcher tests.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import { strict as assert } from "node:assert";

// Isolate file-backed stores BEFORE importing anything that touches
// them. Without this, running the dispatcher suite in the same process
// as other suites (or even against a polluted .data/ dir) lets prior
// state leak into reaction-toggle assertions below.
process.env.STARSCREENER_DATA_DIR = mkdtempSync(
  join(tmpdir(), "starscreener-dispatcher-"),
);

import { dispatchCall } from "../dispatcher";
import {
  clearRepoStore,
  makeRepo,
  seedRepos,
} from "../../tools/__tests__/fixtures";

beforeEach(() => {
  clearRepoStore();
});

test("dispatchCall routes to top_gainers", async () => {
  seedRepos([
    makeRepo({ id: "a--one", starsDelta7d: 100 }),
    makeRepo({ id: "b--two", starsDelta7d: 200 }),
  ]);

  const env = await dispatchCall({ tool: "top_gainers", params: { limit: 2 } });
  assert.equal(env.ok, true);
  if (env.ok) {
    assert.equal((env.result as { count: number }).count, 2);
  }
});

test("dispatchCall returns NOT_FOUND for unknown tool", async () => {
  const env = await dispatchCall({ tool: "no_such_tool", params: {} });
  assert.deepEqual(env, {
    ok: false,
    error: "tool 'no_such_tool' not in manifest",
    code: "NOT_FOUND",
  });
});

test("dispatchCall returns INVALID_PARAMS for bad body", async () => {
  const env1 = await dispatchCall(null);
  assert.equal(env1.ok, false);
  if (!env1.ok) assert.equal(env1.code, "INVALID_PARAMS");

  const env2 = await dispatchCall({});
  assert.equal(env2.ok, false);
  if (!env2.ok) assert.equal(env2.code, "INVALID_PARAMS");

  const env3 = await dispatchCall({ tool: "" });
  assert.equal(env3.ok, false);
  if (!env3.ok) assert.equal(env3.code, "INVALID_PARAMS");
});

test("dispatchCall returns INVALID_PARAMS when a handler's ParamError fires", async () => {
  const env = await dispatchCall({
    tool: "search_repos",
    params: { limit: 5 /* missing required query */ },
  });
  assert.equal(env.ok, false);
  if (!env.ok) assert.equal(env.code, "INVALID_PARAMS");
});

test("dispatchCall returns NOT_FOUND when a handler throws NotFoundError", async () => {
  // No repos in the store → maintainer_profile throws NotFoundError.
  const env = await dispatchCall({
    tool: "maintainer_profile",
    params: { handle: "anthropics" },
  });
  assert.equal(env.ok, false);
  if (!env.ok) assert.equal(env.code, "NOT_FOUND");
});

test("dispatchCall uses NOT_FOUND for the conformance probe tool name", async () => {
  // The upstream spec runner probes with this magic string and expects NOT_FOUND.
  const env = await dispatchCall({
    tool: "__visitportal_conformance_probe__",
    params: {},
  });
  assert.equal(env.ok, false);
  if (!env.ok) assert.equal(env.code, "NOT_FOUND");
});

test("dispatchCall treats missing params as {}", async () => {
  seedRepos([makeRepo({ id: "a--one", starsDelta7d: 5 })]);
  const env = await dispatchCall({ tool: "top_gainers" });
  assert.equal(env.ok, true);
});

test("dispatchCall surfaces AuthError as UNAUTHORIZED for write tools without a principal", async () => {
  const env = await dispatchCall({
    tool: "submit_idea",
    params: {
      title: "Agent without auth",
      pitch: "A pitch long enough to satisfy the composer minimum length.",
    },
  });
  assert.equal(env.ok, false);
  if (!env.ok) {
    assert.equal(env.code, "UNAUTHORIZED");
  }
});

test("dispatchCall forwards the principal into write-tool handlers", async () => {
  const env = await dispatchCall(
    {
      tool: "react_to",
      params: {
        objectType: "repo",
        objectId: "vercel/next.js",
        reactionType: "build",
      },
    },
    { principal: "claude" },
  );
  assert.equal(env.ok, true);
  if (env.ok) {
    const result = env.result as { toggled: string };
    assert.equal(result.toggled, "added");
  }
});
