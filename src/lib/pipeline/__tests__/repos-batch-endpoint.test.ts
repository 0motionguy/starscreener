process.env.STARSCREENER_PERSIST = "false";

import { ensurePipelineRepoJsonlFixture } from "./fixtures/pipeline-repo-fixtures";
ensurePipelineRepoJsonlFixture();

import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

const KNOWN = "vercel/next.js";
const UNKNOWN = "this-owner-definitely/does-not-exist-xyz-9999";

async function invokeRoute(query: string): Promise<Response> {
  const { GET } = await import("../../../app/api/repos/batch/route");
  const url = `http://localhost/api/repos/batch${query}`;
  const req = new NextRequest(url);
  return GET(req as never);
}

test("200 returns rows in request order with mixed known/unknown/invalid slugs", async () => {
  const q = encodeURIComponent(`${KNOWN},${UNKNOWN},bad slug`);
  const res = await invokeRoute(`?slugs=${q}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    ok: boolean;
    repos: Array<{
      slug: string;
      fullName: string;
      profile: unknown | null;
      error?: string;
    }>;
  };
  assert.equal(body.ok, true);
  assert.equal(body.repos.length, 3);
  assert.equal(body.repos[0].slug, KNOWN);
  assert.ok(body.repos[0].profile !== null);
  assert.equal(body.repos[1].slug, UNKNOWN);
  assert.equal(body.repos[1].error, "not_found");
  assert.equal(body.repos[2].slug, "bad slug");
  assert.equal(body.repos[2].error, "invalid_slug");
});

test("400 missing_slugs when query param is absent", async () => {
  const res = await invokeRoute("");
  assert.equal(res.status, 400);
  const body = (await res.json()) as { ok: boolean; code?: string };
  assert.equal(body.ok, false);
  assert.equal(body.code, "missing_slugs");
});
