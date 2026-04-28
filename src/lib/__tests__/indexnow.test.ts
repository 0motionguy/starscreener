import { strict as assert } from "node:assert";
import { afterEach, test } from "node:test";

import { getIndexNowKey, pingIndexNow } from "../indexnow";

const ORIGINAL_INDEXNOW_KEY = process.env.INDEXNOW_KEY;
const ORIGINAL_NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL;
const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  process.env.INDEXNOW_KEY = ORIGINAL_INDEXNOW_KEY;
  process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_NEXT_PUBLIC_APP_URL;
  globalThis.fetch = ORIGINAL_FETCH;
});

test("getIndexNowKey returns null when unset or malformed", () => {
  delete process.env.INDEXNOW_KEY;
  assert.equal(getIndexNowKey(), null);

  process.env.INDEXNOW_KEY = "bad key with spaces";
  assert.equal(getIndexNowKey(), null);
});

test("pingIndexNow posts canonical host, key location, and capped URLs", async () => {
  process.env.INDEXNOW_KEY = "trendingrepo-index-key";
  process.env.NEXT_PUBLIC_APP_URL = "https://trendingrepo.com/";

  let seenBody: unknown;
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "https://api.indexnow.org/indexnow");
    assert.equal(init?.method, "POST");
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers["content-type"], "application/json; charset=utf-8");
    seenBody = JSON.parse(String(init?.body));
    return new Response("", { status: 202 });
  };

  const urls = Array.from(
    { length: 105 },
    (_, i) => `https://trendingrepo.com/repo/acme/project-${i}`,
  );
  const result = await pingIndexNow(urls);

  assert.deepEqual(result, { ok: true, status: 202 });
  assert.deepEqual(seenBody, {
    host: "trendingrepo.com",
    key: "trendingrepo-index-key",
    keyLocation: "https://trendingrepo.com/trendingrepo-index-key.txt",
    urlList: urls.slice(0, 100),
  });
});
