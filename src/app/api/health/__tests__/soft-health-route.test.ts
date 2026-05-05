import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";

test("GET /api/health?soft=1: never returns 500 and always includes typed status", async () => {
  const { GET } = await import("../route");

  const response = await GET(
    new NextRequest("http://localhost/api/health?soft=1"),
  );

  assert.notEqual(response.status, 500);

  const body = (await response.json()) as { status?: string };
  assert.ok(body.status);
  assert.ok(["ok", "stale", "error"].includes(body.status));
});
