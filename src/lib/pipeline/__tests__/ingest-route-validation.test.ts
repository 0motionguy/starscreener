import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = "test-cron-secret";
});

afterEach(() => {
  if (ORIGINAL_CRON_SECRET === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  }
});

test("POST /api/pipeline/ingest rejects invalid JSON body", async () => {
  const { POST } = await import("../../../app/api/pipeline/ingest/route");
  const req = new Request("http://localhost/api/pipeline/ingest", {
    method: "POST",
    headers: {
      authorization: "Bearer test-cron-secret",
      "content-type": "application/json",
    },
    body: "{",
  });

  const res = await POST(req as never);
  assert.equal(res.status, 400);
  const body = (await res.json()) as { ok: boolean; error: string };
  assert.equal(body.ok, false);
  assert.match(body.error, /valid JSON/i);
});

test("POST /api/pipeline/ingest rejects invalid fullNames entries", async () => {
  const { POST } = await import("../../../app/api/pipeline/ingest/route");
  const req = new Request("http://localhost/api/pipeline/ingest", {
    method: "POST",
    headers: {
      authorization: "Bearer test-cron-secret",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      fullNames: ["not-a-repo-name"],
      recomputeAfter: false,
    }),
  });

  const res = await POST(req as never);
  assert.equal(res.status, 400);
  const body = (await res.json()) as { ok: boolean; error: string };
  assert.equal(body.ok, false);
  assert.match(body.error, /owner\/repo/i);
});

