// StarScreener — Portal manifest assembly tests.

import { test } from "node:test";
import { strict as assert } from "node:assert";

import { buildManifest } from "../manifest";
import { validateManifest } from "../validate";

test("buildManifest returns a v0.1-valid manifest with the full tool set", () => {
  const m = buildManifest("https://starscreener.xyz");
  const check = validateManifest(m);
  assert.equal(check.ok, true, check.errors.join("; "));

  assert.equal(m.portal_version, "0.1");
  assert.equal(m.call_endpoint, "https://starscreener.xyz/portal/call");
  assert.equal(m.auth, "none");
  assert.equal(m.pricing.model, "free");

  const names = m.tools.map((t) => t.name).sort();
  // 3 repo/signal tools + 4 builder-layer tools (ideas + reactions + predictions).
  assert.deepEqual(names, [
    "idea",
    "maintainer_profile",
    "predictions_for_repo",
    "reactions_for",
    "search_repos",
    "top_gainers",
    "top_ideas",
  ]);
});

test("buildManifest strips a trailing slash from the base URL", () => {
  const m = buildManifest("https://starscreener.xyz/");
  assert.equal(m.call_endpoint, "https://starscreener.xyz/portal/call");
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
