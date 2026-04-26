// StarScreener — Portal manifest assembly tests.

import { test } from "node:test";
import { strict as assert } from "node:assert";

import { buildManifest } from "../manifest";
import { validateManifest } from "../validate";

test("buildManifest returns a v0.1-valid manifest with every registered tool", () => {
  const m = buildManifest("https://trendingrepo.com");
  const check = validateManifest(m);
  assert.equal(check.ok, true, check.errors.join("; "));

  assert.equal(m.portal_version, "0.1");
  assert.equal(m.call_endpoint, "https://trendingrepo.com/portal/call");
  assert.equal(m.auth, "none");
  assert.equal(m.pricing.model, "free");

  // The manifest is registry-driven (see src/tools/index.ts). The
  // assertion below pins the current set so adding a tool requires
  // consciously updating this test — drift would silently ship
  // agent-visible surfaces otherwise.
  const names = m.tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "get_idea",
    "list_ideas",
    "maintainer_profile",
    "predict_repo",
    "react_to",
    "search_repos",
    "submit_idea",
    "top_gainers",
    "top_reactions",
  ]);
});

test("buildManifest strips a trailing slash from the base URL", () => {
  const m = buildManifest("https://trendingrepo.com/");
  assert.equal(m.call_endpoint, "https://trendingrepo.com/portal/call");
});

test("buildManifest falls back to localhost:3023 when no base URL given", () => {
  // Preserve env around the test.
  const save = process.env.STARSCREENER_PUBLIC_URL;
  delete process.env.STARSCREENER_PUBLIC_URL;
  try {
    const m = buildManifest();
    assert.equal(m.call_endpoint, "http://localhost:3023/portal/call");
  } finally {
    if (save !== undefined) process.env.STARSCREENER_PUBLIC_URL = save;
  }
});
