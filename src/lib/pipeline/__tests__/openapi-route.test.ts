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
  const req = new Request("http://localhost:3023/api/openapi.json");
  return GET(req as never);
}

function resetCache(): void {
  // Symbol-keyed hook published by the route module.
  const key = Symbol.for("trendingrepo.openapi.test.reset");
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

test("GET is private/no-store", async () => {
  resetCache();
  const res = await invokeGet();
  const cc = res.headers.get("cache-control") ?? "";
  assert.ok(cc.includes("private"), `cache-control missing private: ${cc}`);
  assert.ok(cc.includes("no-store"), `cache-control missing no-store: ${cc}`);
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

test("spec does not expose admin/internal/webhook/cron paths", async () => {
  resetCache();
  const res = await invokeGet();
  const body = (await res.json()) as OpenApiDoc;
  for (const p of Object.keys(body.paths)) {
    assert.equal(
      p.startsWith("/api/admin/") ||
        p.startsWith("/api/_internal/") ||
        p.startsWith("/api/webhooks/") ||
        p.startsWith("/api/cron/"),
      false,
      `non-public path leaked: ${p}`,
    );
  }
});

test("encoded non-public path prefixes are treated as non-public", async () => {
  await import("../../../app/api/openapi.json/route");
  const key = Symbol.for("trendingrepo.openapi.test.isPublicPath");
  const isPublicPath = (globalThis as unknown as Record<
    symbol,
    ((pathname: string) => boolean) | undefined
  >)[key];
  assert.equal(typeof isPublicPath, "function");

  const candidates = [
    "/api/%61dmin/stats",
    "/api/%5Finternal/sentry-canary",
    "/api/%77ebhooks/stripe",
    "/api/%63ron/predictions",
  ];
  for (const candidate of candidates) {
    assert.equal(
      isPublicPath!(candidate),
      false,
      `encoded non-public path leaked: ${candidate}`,
    );
  }
});

test("spec hides admin/cron security schemes", async () => {
  resetCache();
  const res = await invokeGet();
  const body = (await res.json()) as OpenApiDoc;
  const schemes = body.components?.securitySchemes;
  assert.ok(schemes, "components.securitySchemes missing");
  for (const name of ["userBearer", "sessionCookie"]) {
    assert.ok(name in schemes, `securityScheme missing: ${name}`);
  }
  assert.equal("cronBearer" in schemes, false);
  assert.equal("adminBearer" in schemes, false);
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
