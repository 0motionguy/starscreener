// Private watchlist — store + route tests.
//
// Covers:
//   1. Store semantics:
//        - upsert round-trip
//        - idempotent same-input write
//        - cap enforcement
//        - delete + reread = null
//   2. Route behavior:
//        - 401 without any auth in prod
//        - 402 without Pro entitlement
//        - PUT / GET / DELETE round-trip with a Pro tier assigned
//        - cross-user isolation (userA cannot read userB's list)
//
// Node:test, no mocking framework. Each test owns a fresh STARSCREENER_DATA_DIR.

import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

async function withTmpDataDir<T>(
  fn: (dir: string) => Promise<T>,
): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ss-private-wl-"));
  const prior = process.env.STARSCREENER_DATA_DIR;
  process.env.STARSCREENER_DATA_DIR = dir;
  try {
    return await fn(dir);
  } finally {
    if (prior === undefined) delete process.env.STARSCREENER_DATA_DIR;
    else process.env.STARSCREENER_DATA_DIR = prior;
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function withEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const prior: Record<string, string | undefined> = {};
  for (const k of Object.keys(overrides)) prior[k] = process.env[k];
  try {
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(prior)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/** Pre-seed the user-tiers store so the authed "local" userId is Pro. */
async function seedProTier(dir: string, userId: string = "local"): Promise<void> {
  const body =
    JSON.stringify({
      userId,
      tier: "pro",
      expiresAt: null,
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    }) + "\n";
  await fs.writeFile(path.join(dir, "user-tiers.jsonl"), body, "utf8");
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

test("store — set then get round-trips the list (deduped, lowercased, sorted)", async () => {
  await withTmpDataDir(async () => {
    const store = await import("../../watchlist/private-store");
    await store.setPrivateWatchlist("user-1", [
      "Vercel/Next.js",
      "ollama/ollama",
      "vercel/next.js", // dupe by case
    ]);
    const got = await store.getPrivateWatchlist("user-1");
    assert.ok(got);
    assert.equal(got.userId, "user-1");
    assert.deepEqual(got.repoFullNames, ["ollama/ollama", "vercel/next.js"]);
    // updatedAt is an ISO string.
    assert.match(got.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  });
});

test("store — writing the same set twice is idempotent (bytes on disk match modulo updatedAt)", async () => {
  await withTmpDataDir(async () => {
    const store = await import("../../watchlist/private-store");
    await store.setPrivateWatchlist("user-1", ["a/b", "c/d"]);
    const first = await store.getPrivateWatchlist("user-1");
    await store.setPrivateWatchlist("user-1", ["c/d", "a/b"]); // reordered
    const second = await store.getPrivateWatchlist("user-1");
    assert.deepEqual(first?.repoFullNames, second?.repoFullNames);
  });
});

test("store — cap enforced at MAX_PRIVATE_WATCHLIST_REPOS", async () => {
  await withTmpDataDir(async () => {
    const store = await import("../../watchlist/private-store");
    // Generate cap+50 valid fullNames. Use a short owner so the valid
    // regex passes.
    const fullNames: string[] = [];
    for (let i = 0; i < store.MAX_PRIVATE_WATCHLIST_REPOS + 50; i += 1) {
      fullNames.push(`owner/repo-${i.toString().padStart(5, "0")}`);
    }
    const entry = await store.setPrivateWatchlist("user-cap", fullNames);
    assert.equal(entry.repoFullNames.length, store.MAX_PRIVATE_WATCHLIST_REPOS);
  });
});

test("store — invalid entries are dropped by normalizeFullNames but valid ones keep through", async () => {
  await withTmpDataDir(async () => {
    const store = await import("../../watchlist/private-store");
    const { valid, invalid } = store.normalizeFullNames([
      "ok/one",
      "bad_no_slash",
      "",
      "UpperCase/Name",
      "too/many/slashes",
    ]);
    assert.deepEqual(valid, ["ok/one", "uppercase/name"]);
    assert.deepEqual(invalid.sort(), ["", "bad_no_slash", "too/many/slashes"].sort());
  });
});

test("store — delete removes the entry, subsequent get returns null", async () => {
  await withTmpDataDir(async () => {
    const store = await import("../../watchlist/private-store");
    await store.setPrivateWatchlist("user-del", ["a/b", "c/d"]);
    await store.deletePrivateWatchlist("user-del");
    const got = await store.getPrivateWatchlist("user-del");
    assert.equal(got, null);
  });
});

test("store — cross-user reads are impossible (userA cannot observe userB)", async () => {
  await withTmpDataDir(async () => {
    const store = await import("../../watchlist/private-store");
    await store.setPrivateWatchlist("user-a", ["a/a"]);
    await store.setPrivateWatchlist("user-b", ["b/b"]);
    const a = await store.getPrivateWatchlist("user-a");
    const b = await store.getPrivateWatchlist("user-b");
    const absent = await store.getPrivateWatchlist("user-c");
    assert.deepEqual(a?.repoFullNames, ["a/a"]);
    assert.deepEqual(b?.repoFullNames, ["b/b"]);
    assert.equal(absent, null);
  });
});

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

function mkRequest(
  method: string,
  body: unknown = null,
  headers: Record<string, string> = {},
): Request {
  const init: RequestInit = {
    method,
    headers: { "content-type": "application/json", ...headers },
  };
  if (body !== null && body !== undefined && method !== "GET") {
    init.body = JSON.stringify(body);
  }
  return new Request("http://localhost/api/watchlist/private", init);
}

test("route — 401/503 when no auth configured in production", async () => {
  await withTmpDataDir(async () => {
    await withEnv(
      {
        NODE_ENV: "production",
        USER_TOKEN: undefined,
        USER_TOKENS_JSON: undefined,
        SESSION_SECRET: undefined,
      },
      async () => {
        const { GET } = await import("../../../app/api/watchlist/private/route");
        const res = await GET(mkRequest("GET") as never);
        assert.ok(res.status === 401 || res.status === 503, `got ${res.status}`);
      },
    );
  });
});

test("route — 402 when authed (local) but tier is free", async () => {
  await withTmpDataDir(async () => {
    await withEnv(
      { NODE_ENV: "development", USER_TOKEN: undefined, USER_TOKENS_JSON: undefined },
      async () => {
        const { GET } = await import("../../../app/api/watchlist/private/route");
        const res = await GET(mkRequest("GET") as never);
        assert.equal(res.status, 402);
        const body = (await res.json()) as { code: string };
        assert.equal(body.code, "PAYMENT_REQUIRED");
      },
    );
  });
});

test("route — PUT / GET / DELETE round-trip when user is Pro", async () => {
  await withTmpDataDir(async (dir) => {
    await seedProTier(dir, "local");
    await withEnv(
      { NODE_ENV: "development", USER_TOKEN: undefined, USER_TOKENS_JSON: undefined },
      async () => {
        const { GET, PUT, DELETE } = await import(
          "../../../app/api/watchlist/private/route"
        );

        // Initial GET → null entry.
        {
          const res = await GET(mkRequest("GET") as never);
          assert.equal(res.status, 200);
          const body = (await res.json()) as { ok: true; entry: unknown };
          assert.equal(body.entry, null);
          // private, no-store header present.
          assert.match(res.headers.get("cache-control") ?? "", /private, no-store/);
        }

        // PUT → upsert.
        {
          const res = await PUT(
            mkRequest("PUT", { fullNames: ["vercel/next.js", "ollama/ollama"] }) as never,
          );
          assert.equal(res.status, 200);
          const body = (await res.json()) as {
            ok: true;
            entry: { repoFullNames: string[] };
            dropped: string[];
          };
          assert.deepEqual(body.entry.repoFullNames, ["ollama/ollama", "vercel/next.js"]);
          assert.deepEqual(body.dropped, []);
        }

        // GET → now returns the entry.
        {
          const res = await GET(mkRequest("GET") as never);
          const body = (await res.json()) as { entry: { repoFullNames: string[] } };
          assert.deepEqual(body.entry.repoFullNames, ["ollama/ollama", "vercel/next.js"]);
        }

        // DELETE → removes.
        {
          const res = await DELETE(mkRequest("DELETE") as never);
          assert.equal(res.status, 200);
        }
        {
          const res = await GET(mkRequest("GET") as never);
          const body = (await res.json()) as { entry: unknown };
          assert.equal(body.entry, null);
        }
      },
    );
  });
});

test("route — PUT rejects over-cap bodies with 400", async () => {
  await withTmpDataDir(async (dir) => {
    await seedProTier(dir, "local");
    await withEnv(
      { NODE_ENV: "development", USER_TOKEN: undefined, USER_TOKENS_JSON: undefined },
      async () => {
        const store = await import("../../watchlist/private-store");
        const { PUT } = await import("../../../app/api/watchlist/private/route");
        const fullNames: string[] = [];
        for (let i = 0; i < store.MAX_PRIVATE_WATCHLIST_REPOS + 1; i += 1) {
          fullNames.push(`owner/repo-${i}`);
        }
        const res = await PUT(mkRequest("PUT", { fullNames }) as never);
        assert.equal(res.status, 400);
        const body = (await res.json()) as { code: string };
        assert.equal(body.code, "TOO_MANY_REPOS");
      },
    );
  });
});

test("route — PUT with invalid entries keeps the valid ones and surfaces dropped list", async () => {
  await withTmpDataDir(async (dir) => {
    await seedProTier(dir, "local");
    await withEnv(
      { NODE_ENV: "development", USER_TOKEN: undefined, USER_TOKENS_JSON: undefined },
      async () => {
        const { PUT } = await import("../../../app/api/watchlist/private/route");
        const res = await PUT(
          mkRequest("PUT", { fullNames: ["ok/repo", "no_slash_here", "another/ok"] }) as never,
        );
        assert.equal(res.status, 200);
        const body = (await res.json()) as {
          entry: { repoFullNames: string[] };
          dropped: string[];
        };
        assert.deepEqual(body.entry.repoFullNames, ["another/ok", "ok/repo"]);
        assert.deepEqual(body.dropped, ["no_slash_here"]);
      },
    );
  });
});
