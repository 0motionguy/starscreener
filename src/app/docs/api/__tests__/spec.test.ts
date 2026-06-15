// /docs/api — spec loader contract.
//
// The page renders straight off `getApiCatalog()`. These tests pin the
// invariants the page assumes: the catalog has endpoints, sections are
// non-empty, parameter $refs resolved, and `methodTone` returns a known
// Badge tone for every method actually present in the spec.

import assert from "node:assert/strict";
import test from "node:test";

import { buildCurlExample, methodTone, buildResponseHint } from "../examples";
import { getApiCatalog } from "../spec";

const DOCS_API_TEST_RESET = Symbol.for("trendingrepo.docs.api.test.reset");

function resetCache() {
  const reset = (globalThis as unknown as Record<symbol, () => void>)[
    DOCS_API_TEST_RESET
  ];
  if (typeof reset === "function") reset();
}

test.beforeEach(() => {
  resetCache();
});

test("catalog loads endpoints from docs/openapi.json", () => {
  const catalog = getApiCatalog();
  assert.equal(catalog.title, "TrendingRepo API");
  assert.ok(catalog.version.length > 0);
  assert.ok(catalog.totalEndpoints > 0, "expected non-zero endpoints");
  assert.ok(catalog.sections.length > 0, "expected at least one section");
  assert.ok(catalog.servers.length > 0, "expected at least one server");
});

test("catalog resolves $ref parameters into resolved OpenApiParameter objects", () => {
  const catalog = getApiCatalog();
  const profileSection = catalog.sections.find((s) => s.tag === "Profile");
  assert.ok(profileSection, "Profile section present");
  const repoOp = profileSection.endpoints.find(
    (e) => e.path === "/api/repos/{owner}/{name}" && e.method === "get",
  );
  assert.ok(repoOp, "getRepoProfile op present");
  const ownerParam = repoOp.parameters.find((p) => p.name === "owner");
  assert.ok(ownerParam, "owner path param resolved");
  assert.equal(ownerParam.in, "path");
  assert.equal(ownerParam.required, true);
});

test("catalog groups endpoints by primary tag (first tag in the spec)", () => {
  const catalog = getApiCatalog();
  const evidenceSection = catalog.sections.find((s) => s.tag === "Evidence");
  assert.ok(
    !evidenceSection,
    "Evidence is a secondary tag — should not lead its own section",
  );
  const profileSection = catalog.sections.find((s) => s.tag === "Profile");
  assert.ok(profileSection, "Profile section is present");
  assert.ok(profileSection.endpoints.length > 0);
});

test("every endpoint surfaces a stable anchor", () => {
  const catalog = getApiCatalog();
  const anchors = new Set<string>();
  for (const section of catalog.sections) {
    for (const endpoint of section.endpoints) {
      assert.ok(endpoint.anchor.startsWith("op-"));
      assert.ok(!anchors.has(endpoint.anchor), `duplicate anchor ${endpoint.anchor}`);
      anchors.add(endpoint.anchor);
    }
  }
});

test("methodTone returns a known Badge tone for every method in the spec", () => {
  const catalog = getApiCatalog();
  const knownTones = new Set([
    "accent",
    "positive",
    "warning",
    "danger",
    "neutral",
  ]);
  for (const section of catalog.sections) {
    for (const endpoint of section.endpoints) {
      assert.ok(
        knownTones.has(methodTone(endpoint.method)),
        `tone for ${endpoint.method}`,
      );
    }
  }
});

test("buildCurlExample produces a parseable command for every endpoint", () => {
  const catalog = getApiCatalog();
  for (const section of catalog.sections) {
    for (const endpoint of section.endpoints) {
      const curl = buildCurlExample(endpoint);
      assert.match(curl, /^curl/);
      assert.match(curl, /trendingrepo\.com/);
      // Path params must be filled.
      assert.ok(!curl.includes("{owner}"), `${endpoint.path}: {owner} not filled`);
      assert.ok(!curl.includes("{name}"), `${endpoint.path}: {name} not filled`);
      // Authed ops include a header.
      if (endpoint.security.length > 0) {
        assert.match(
          curl,
          /Authorization|Cookie/,
          `${endpoint.path}: authed op missing header`,
        );
      }
    }
  }
});

test("buildResponseHint returns a non-empty hint for every endpoint", () => {
  const catalog = getApiCatalog();
  for (const section of catalog.sections) {
    for (const endpoint of section.endpoints) {
      const hint = buildResponseHint(endpoint);
      assert.ok(hint.length > 0);
    }
  }
});

test("getApiCatalog memoises across calls", () => {
  const a = getApiCatalog();
  const b = getApiCatalog();
  assert.equal(a, b, "memoised instance should be reference-equal");
});
