// API key lifecycle tests.

import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const TMP_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "ss-api-keys-"));
process.env.STARSCREENER_DATA_DIR = TMP_DATA_DIR;
process.env.USER_TOKENS_JSON = JSON.stringify({
  "test-user-token": "user_keys",
});

beforeEach(async () => {
  const { __resetApiKeyCacheForTests } = await import("../../api/api-keys");
  __resetApiKeyCacheForTests();
  rmSync(path.join(TMP_DATA_DIR, "api-keys.jsonl"), { force: true });
});

after(() => {
  rmSync(TMP_DATA_DIR, { recursive: true, force: true });
});

test("create/list/verify/revoke API key", async () => {
  const {
    createApiKey,
    listApiKeys,
    revokeApiKey,
    verifyApiKeyTokenSync,
  } = await import("../../api/api-keys");

  const created = await createApiKey("user_keys", "CI smoke");
  assert.match(created.token, /^sskey_/);
  assert.equal(created.record.name, "CI smoke");
  assert.equal(verifyApiKeyTokenSync(created.token), "user_keys");

  const listed = await listApiKeys("user_keys");
  assert.equal(listed.length, 1);
  assert.equal("tokenHash" in listed[0], false);

  const revoked = await revokeApiKey("user_keys", created.record.id);
  assert.ok(revoked);
  assert.equal(revoked!.revokedAt !== null, true);
  assert.equal(verifyApiKeyTokenSync(created.token), null);
});

async function invokeKeysPost(): Promise<{ status: number; body: Record<string, unknown> }> {
  const { POST } = await import("../../../app/api/keys/route");
  const req = new Request("http://localhost/api/keys", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-token": "test-user-token",
    },
    body: JSON.stringify({ name: "Route key" }),
  });
  const res = await POST(req as never);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

test("POST /api/keys returns token once and the token authenticates", async () => {
  const { verifyUserAuth } = await import("../../api/auth");
  const { status, body } = await invokeKeysPost();

  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(typeof body.token, "string");

  const req = new Request("http://localhost/api/mcp/usage", {
    headers: { "x-api-key": body.token as string },
  });
  const auth = verifyUserAuth(req as never);
  assert.equal(auth.kind, "ok");
  if (auth.kind === "ok") assert.equal(auth.userId, "user_keys");
});
