// StarScreener — Portal manifest assembly tests.

import { test } from "node:test";
import { strict as assert } from "node:assert";

import { buildManifest } from "../manifest";
import { validateManifest } from "../validate";

test("buildManifest returns a v0.1-valid manifest with every registered tool", () => {
  const m = buildManifest("https://starscreener.xyz");
  const check = validateManifest(m);
  assert.equal(check.ok, true, check.errors.join("; "));

  assert.equal(m.portal_version, "0.1");
  assert.equal(m.call_endpoint, "https://starscreener.xyz/portal/call");
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
  const m = buildManifest("https://starscreener.xyz/");
  assert.equal(m.call_endpoint, "https://starscreener.xyz/portal/call");
});

test("buildManifest falls back to localhost:3023 when no base URL given (legacy STARSCREENER_PUBLIC_URL unset)", () => {
  // Preserve env around the test.
  const saveLegacy = process.env.STARSCREENER_PUBLIC_URL;
  const saveNew = process.env.TRENDINGREPO_PUBLIC_URL;
  delete process.env.STARSCREENER_PUBLIC_URL;
  delete process.env.TRENDINGREPO_PUBLIC_URL;
  try {
    const m = buildManifest();
    assert.equal(m.call_endpoint, "http://localhost:3023/portal/call");
  } finally {
    if (saveLegacy !== undefined)
      process.env.STARSCREENER_PUBLIC_URL = saveLegacy;
    if (saveNew !== undefined) process.env.TRENDINGREPO_PUBLIC_URL = saveNew;
  }
});

test("buildManifest reads TRENDINGREPO_PUBLIC_URL when set (preferred over legacy)", () => {
  const saveLegacy = process.env.STARSCREENER_PUBLIC_URL;
  const saveNew = process.env.TRENDINGREPO_PUBLIC_URL;
  delete process.env.STARSCREENER_PUBLIC_URL;
  process.env.TRENDINGREPO_PUBLIC_URL = "https://example.test";
  try {
    const m = buildManifest();
    assert.equal(m.call_endpoint, "https://example.test/portal/call");
  } finally {
    if (saveLegacy !== undefined)
      process.env.STARSCREENER_PUBLIC_URL = saveLegacy;
    else delete process.env.STARSCREENER_PUBLIC_URL;
    if (saveNew !== undefined) process.env.TRENDINGREPO_PUBLIC_URL = saveNew;
    else delete process.env.TRENDINGREPO_PUBLIC_URL;
  }
});

test("buildManifest reads legacy STARSCREENER_PUBLIC_URL when only the old name is set", () => {
  const saveLegacy = process.env.STARSCREENER_PUBLIC_URL;
  const saveNew = process.env.TRENDINGREPO_PUBLIC_URL;
  delete process.env.TRENDINGREPO_PUBLIC_URL;
  process.env.STARSCREENER_PUBLIC_URL = "https://legacy.test";
  try {
    const m = buildManifest();
    assert.equal(m.call_endpoint, "https://legacy.test/portal/call");
  } finally {
    if (saveLegacy !== undefined)
      process.env.STARSCREENER_PUBLIC_URL = saveLegacy;
    else delete process.env.STARSCREENER_PUBLIC_URL;
    if (saveNew !== undefined) process.env.TRENDINGREPO_PUBLIC_URL = saveNew;
  }
});
