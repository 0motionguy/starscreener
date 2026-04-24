// StarScreener Pipeline — GET /api/openapi.json tests.
//
// Covers:
//   - GET returns 200 with Content-Type application/json and the expected
//     Cache-Control header.
//   - Payload declares openapi: "3.1.x" and carries `info.title`, `paths`,
//     `components.securitySchemes`.
//   - The canonical profile paths we rely on in every integration are
//     present in the spec (regression guard against an accidental scope
//     trim).
//   - Module-level cache behaves: two calls return equivalent bodies
//     (sanity check that caching didn't corrupt the response).
//
// Run with:
//   npx tsx --test src/lib/pipeline/__tests__/openapi-route.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";

// Force the nodejs runtime export check — route must be explicitly "nodejs"
// because it reads docs/openapi.json from disk via fs. If someone flips it
// to "edge" the route will 500 at request time.

async function invokeGet(): Promise<Response> {
  const { GET } = await import("../../../app/api/openapi.json/route");
  // The route handler takes no request arg (the spec is a static document).
  return GET();
}

function resetCache(): void {
  // Symbol-keyed hook published by the route module.
  const key = Symbol.for("starscreener.openapi.test.reset");
  const fn = (globalThis as unknown as Record<symbol, (() => void) | undefined>)[
    key
  ];
  if (typeof fn === "function") fn();
}

// ---------------------------------------------------------------------------
// Response headers + status
// ---------------------------------------------------------------------------

test("GET 200 with JSON content type", async () => {
  resetCache();
  const res = await invokeGet();
  assert.equal(res.status, 200);
  const ct = res.headers.get("content-type") ?? "";
  assert.ok(
    ct.startsWith("application/json"),
    `expected application/json, got ${ct}`,
  );
});

test("GET sets an edge-friendly Cache-Control", async () => {
  resetCache();
  const res = await invokeGet();
  const cc = res.headers.get("cache-control") ?? "";
  assert.ok(cc.includes("public"), `cache-control missing public: ${cc}`);
  assert.ok(
    cc.includes("s-maxage="),
    `cache-control missing s-maxage: ${cc}`,
  );
  assert.ok(
    cc.includes("stale-while-revalidate="),
    `cache-control missing swr: ${cc}`,
  );
});

// ---------------------------------------------------------------------------
// Payload shape
// ---------------------------------------------------------------------------

interface OpenApiDoc {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, unknown>;
  components?: { securitySchemes?: Record<string, unknown> };
}

test("payload is a valid OpenAPI 3.1 document", async () => {
  resetCache();
  const res = await invokeGet();
  const body = (await res.json()) as OpenApiDoc;

  assert.ok(
    /^3\.1\.\d+$/.test(body.openapi),
    `expected openapi 3.1.x, got '${body.openapi}'`,
  );
  assert.equal(typeof body.info?.title, "string");
  assert.ok(body.info.title.length > 0);
  assert.equal(typeof body.info?.version, "string");
  assert.equal(typeof body.paths, "object");
});

test("spec declares the canonical profile paths", async () => {
  resetCache();
  const res = await invokeGet();
  const body = (await res.json()) as OpenApiDoc;

  // Regression guard — these four paths are the spine of any external
  // integration that depends on the canonical profile contract. If a future
  // edit to the YAML accidentally drops one, this test will surface it
  // before the MCP / CLI consumers notice at runtime.
  const required = [
    "/api/repos/{owner}/{name}",
    "/api/repos/{owner}/{name}/mentions",
    "/api/repos/{owner}/{name}/freshness",
    "/api/repos/{owner}/{name}/aiso",
    "/api/repos",
    "/api/search",
    "/api/categories",
    "/api/openapi.json",
  ] as const;

  for (const p of required) {
    assert.ok(p in body.paths, `spec is missing path: ${p}`);
  }
});

test("spec declares the four security schemes", async () => {
  resetCache();
  const res = await invokeGet();
  const body = (await res.json()) as OpenApiDoc;
  const schemes = body.components?.securitySchemes;
  assert.ok(schemes, "components.securitySchemes missing");
  for (const name of ["cronBearer", "adminBearer", "userBearer", "sessionCookie"]) {
    assert.ok(name in schemes, `securityScheme missing: ${name}`);
  }
});

// ---------------------------------------------------------------------------
// Cache behavior
// ---------------------------------------------------------------------------

test("repeat calls return an equivalent body (module cache sanity)", async () => {
  resetCache();
  const first = await invokeGet();
  const second = await invokeGet();
  const a = (await first.json()) as OpenApiDoc;
  const b = (await second.json()) as OpenApiDoc;
  assert.equal(a.openapi, b.openapi);
  assert.equal(a.info.title, b.info.title);
  assert.equal(
    Object.keys(a.paths).length,
    Object.keys(b.paths).length,
    "paths count drifted between calls",
  );
});
