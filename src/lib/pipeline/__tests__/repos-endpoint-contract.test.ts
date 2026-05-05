process.env.STARSCREENER_PERSIST = "false";

import { ensurePipelineRepoJsonlFixture } from "./fixtures/pipeline-repo-fixtures";
ensurePipelineRepoJsonlFixture();

import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

async function invokeRoute(query: string): Promise<Response> {
  const { GET } = await import("../../../app/api/repos/route");
  const req = new NextRequest(`http://localhost/api/repos${query}`);
  return GET(req as never);
}

test("GET /api/repos: 200 success envelope shape", async () => {
  const res = await invokeRoute("?limit=5");
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    repos: unknown[];
    meta: {
      total: number;
      limit: number;
      offset: number;
      period: string;
      filter: string;
    };
  };
  assert.ok(Array.isArray(body.repos));
  assert.equal(typeof body.meta.total, "number");
  assert.equal(body.meta.limit, 5);
  assert.equal(body.meta.offset, 0);
  assert.equal(typeof body.meta.period, "string");
  assert.equal(typeof body.meta.filter, "string");
});

test("GET /api/repos: invalid sort returns 400 typed error", async () => {
  const res = await invokeRoute("?sort=invalid-sort");
  assert.equal(res.status, 400);
  const body = (await res.json()) as {
    ok: boolean;
    error: string;
    valid: string[];
  };
  assert.equal(body.ok, false);
  assert.match(body.error, /Invalid sort/i);
  assert.ok(Array.isArray(body.valid));
  assert.ok(body.valid.includes("trending"));
});

test("GET /api/repos: invalid period returns 400 typed error", async () => {
  const res = await invokeRoute("?period=year");
  assert.equal(res.status, 400);
  const body = (await res.json()) as {
    ok: boolean;
    error: string;
    valid: string[];
  };
  assert.equal(body.ok, false);
  assert.match(body.error, /Invalid period/i);
  assert.ok(body.valid.includes("week"));
});

test("GET /api/repos: invalid filter returns 400 typed error", async () => {
  const res = await invokeRoute("?filter=unknown");
  assert.equal(res.status, 400);
  const body = (await res.json()) as {
    ok: boolean;
    error: string;
    valid: string[];
  };
  assert.equal(body.ok, false);
  assert.match(body.error, /Invalid filter/i);
  assert.ok(body.valid.includes("all"));
});

test("GET /api/repos: invalid tag returns 400 envelope", async () => {
  const res = await invokeRoute("?tag=bad%20tag");
  assert.equal(res.status, 400);
  const body = (await res.json()) as { ok: boolean; error: string };
  assert.equal(body.ok, false);
  assert.match(body.error, /Invalid tag/i);
});

test("GET /api/repos: invalid fields returns 400 with valid field list", async () => {
  const res = await invokeRoute("?fields=notAField");
  assert.equal(res.status, 400);
  const body = (await res.json()) as {
    ok: boolean;
    error: string;
    valid: string[];
  };
  assert.equal(body.ok, false);
  assert.match(body.error, /Invalid fields/i);
  assert.ok(Array.isArray(body.valid));
  assert.ok(body.valid.includes("fullName"));
});

test("GET /api/repos?ids=: ids envelope contains requested + missing metadata", async () => {
  const res = await invokeRoute("?ids=vercel/next.js,this-owner-definitely/does-not-exist-xyz");
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    repos: Array<{ fullName?: string }>;
    meta: {
      total: number;
      requested: number;
      missing: string[];
    };
  };
  assert.ok(Array.isArray(body.repos));
  assert.equal(body.meta.requested, 2);
  assert.equal(typeof body.meta.total, "number");
  assert.ok(Array.isArray(body.meta.missing));
  assert.ok(body.meta.missing.includes("this-owner-definitely/does-not-exist-xyz"));
});
