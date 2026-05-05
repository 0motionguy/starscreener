import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { onPipelineEvent } from "@/lib/pipeline/events";

const ORIGINAL_VERCEL = process.env.VERCEL;
const ORIGINAL_MAX = process.env.SSE_MAX_SUBSCRIBERS;

test("stream route returns typed 501 envelope on vercel runtime", async () => {
  process.env.VERCEL = "1";
  process.env.SSE_MAX_SUBSCRIBERS = "50";
  const { GET } = await import("@/app/api/stream/route");

  const req = new NextRequest("https://trendingrepo.com/api/stream");
  const res = await GET(req);
  assert.equal(res.status, 501);
  assert.deepEqual(await res.json(), {
    ok: false,
    error: "SSE not supported on Vercel — deploy to Railway/Fly/self-host",
    code: "SSE_UNAVAILABLE_ON_VERCEL",
  });
});

test("stream route enforces subscriber cap", async () => {
  delete process.env.VERCEL;
  process.env.SSE_MAX_SUBSCRIBERS = "1";
  const { GET } = await import("@/app/api/stream/route");

  const unsubscribe = onPipelineEvent(() => {
    // no-op subscriber used to simulate one active SSE client
  });

  const req2 = new NextRequest("https://trendingrepo.com/api/stream");
  const res2 = await GET(req2);
  assert.equal(res2.status, 503);
  const fullFrame = await res2.text();
  assert.match(fullFrame, /^event: full\n/);
  assert.match(fullFrame, /"max":1/);
  unsubscribe();
});

test("stream route source keeps ready frame and heartbeat contract", async () => {
  const routePath = path.resolve(process.cwd(), "src/app/api/stream/route.ts");
  const source = await readFile(routePath, "utf8");
  assert.match(source, /event: ready/);
  assert.match(source, /heartbeat/);
  assert.match(source, /Content-Type": "text\/event-stream; charset=utf-8"/);
  assert.match(source, /"mention_ingested"/);
});

test.after(() => {
  if (ORIGINAL_VERCEL === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = ORIGINAL_VERCEL;
  if (ORIGINAL_MAX === undefined) delete process.env.SSE_MAX_SUBSCRIBERS;
  else process.env.SSE_MAX_SUBSCRIBERS = ORIGINAL_MAX;
});
