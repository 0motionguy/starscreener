process.env.STARSCREENER_PERSIST = "false";
process.env.CRON_SECRET = process.env.CRON_SECRET ?? "test-cron-secret";

import { ensurePipelineRepoJsonlFixture } from "./fixtures/pipeline-repo-fixtures";
ensurePipelineRepoJsonlFixture();

import { test } from "node:test";
import assert from "node:assert/strict";
import { SITE_URL } from "../../../lib/seo";

function expectBoolean(value: unknown, field: string): void {
  assert.equal(typeof value, "boolean", `${field} must be boolean`);
}

function expectString(value: unknown, field: string): void {
  assert.equal(typeof value, "string", `${field} must be string`);
}

function expectArray(value: unknown, field: string): void {
  assert.ok(Array.isArray(value), `${field} must be an array`);
}

test("GET /api/oembed request+response contract: success envelope shape", async () => {
  const base = SITE_URL.replace(/\/+$/, "");
  const { GET } = await import("../../../app/api/oembed/route");
  const res = await GET(
    {
      nextUrl: new URL(
        `${base}/api/oembed?url=${encodeURIComponent(`${base}/repo/vercel/next.js`)}`,
      ),
    } as never,
  );
  assert.equal(res.status, 200);

  const body = (await res.json()) as {
    version: unknown;
    type: unknown;
    title: unknown;
    provider_name: unknown;
    html: unknown;
  };

  assert.equal(body.version, "1.0");
  assert.equal(body.type, "rich");
  expectString(body.title, "title");
  expectString(body.provider_name, "provider_name");
  expectString(body.html, "html");
});

test("GET /api/compare request+response contract: validation error envelope shape", async () => {
  const { GET } = await import("../../../app/api/compare/route");
  const res = await GET(
    new Request("http://localhost/api/compare?repos=bad slug") as never,
  );
  assert.equal(res.status, 400);

  const body = (await res.json()) as {
    ok: unknown;
    error: unknown;
    code: unknown;
  };
  expectBoolean(body.ok, "ok");
  assert.equal(body.ok, false);
  expectString(body.error, "error");
  expectString(body.code, "code");
  assert.equal(body.code, "invalid_repo");
});

test("GET /api/oembed request+response contract: unsupported format envelope shape", async () => {
  const { GET } = await import("../../../app/api/oembed/route");
  const res = await GET(
    {
      nextUrl: new URL(
        "https://trendingrepo.com/api/oembed?format=xml&url=https://trendingrepo.com/repo/vercel/next.js",
      ),
    } as never,
  );
  assert.equal(res.status, 501);

  const body = (await res.json()) as {
    ok: unknown;
    error: unknown;
    code: unknown;
  };
  expectBoolean(body.ok, "ok");
  assert.equal(body.ok, false);
  expectString(body.error, "error");
  assert.equal(body.code, "UNSUPPORTED_FORMAT");
});
