import { test } from "node:test";
import assert from "node:assert/strict";

import { fetchNpmDependentsFromToolbox } from "../toolbox-store-npm";

function fakeFetch(responses: {
  status?: number;
  body?: unknown;
  throwError?: Error;
}): typeof fetch {
  return (async () => {
    if (responses.throwError) throw responses.throwError;
    return {
      ok: (responses.status ?? 200) >= 200 && (responses.status ?? 200) < 300,
      status: responses.status ?? 200,
      json: async () => responses.body,
    } as Response;
  }) as unknown as typeof fetch;
}

test("npm-dependents: shapes happy-path response into map", async () => {
  const result = await fetchNpmDependentsFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({
      body: {
        count: 2,
        targets: [
          {
            target_id: "p1",
            target_kind: "url",
            target_identity: "https://npmjs.com/package/foo",
            scan_id: "s1",
            run_id: "r1",
            signal_type: "trending.npm.dependents",
            produced_at: "2026-05-13T10:00:00Z",
            fields: {
              package: "foo",
              dependents_count: 1500,
              fetched_at: "2026-05-13T09:00:00Z",
            },
          },
          {
            target_id: "p2",
            target_kind: "url",
            target_identity: "https://npmjs.com/package/bar",
            scan_id: "s1",
            run_id: "r2",
            signal_type: "trending.npm.dependents",
            produced_at: "2026-05-13T10:00:00Z",
            fields: {
              package: "bar",
              dependents_count: 42,
              fetched_at: "2026-05-13T09:00:00Z",
            },
          },
        ],
      },
    }),
  });

  assert.ok(result);
  assert.equal(result!.foo.count, 1500);
  assert.equal(result!.foo.fetchedAt, "2026-05-13T09:00:00Z");
  assert.equal(result!.bar.count, 42);
});

test("npm-dependents: preserves null counts (npm has no clean API)", async () => {
  const result = await fetchNpmDependentsFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({
      body: {
        count: 1,
        targets: [
          {
            target_id: "p1",
            target_kind: "url",
            target_identity: "https://npmjs.com/package/foo",
            scan_id: "s1",
            run_id: "r1",
            signal_type: "trending.npm.dependents",
            produced_at: "2026-05-13T10:00:00Z",
            fields: {
              package: "foo",
              dependents_count: null,
              fetched_at: "2026-05-13T09:00:00Z",
            },
          },
        ],
      },
    }),
  });

  assert.ok(result);
  assert.equal(result!.foo.count, null);
});

test("npm-dependents: skips events without package name", async () => {
  const result = await fetchNpmDependentsFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({
      body: {
        count: 2,
        targets: [
          {
            target_id: "p1",
            target_kind: "url",
            target_identity: "https://npmjs.com/package/foo",
            scan_id: "s1",
            run_id: "r1",
            signal_type: "trending.npm.dependents",
            produced_at: "2026-05-13T10:00:00Z",
            fields: { package: "foo", dependents_count: 10 },
          },
          {
            target_id: "p2",
            target_kind: "url",
            target_identity: "https://npmjs.com/package/anon",
            scan_id: "s1",
            run_id: "r2",
            signal_type: "trending.npm.dependents",
            produced_at: "2026-05-13T10:00:00Z",
            fields: { dependents_count: 5 }, // no package name → skip
          },
        ],
      },
    }),
  });
  assert.ok(result);
  assert.deepEqual(Object.keys(result!), ["foo"]);
});

test("npm-dependents: returns null on HTTP error", async () => {
  const result = await fetchNpmDependentsFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({ status: 500 }),
  });
  assert.equal(result, null);
});

test("npm-dependents: invalid count becomes null", async () => {
  const result = await fetchNpmDependentsFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({
      body: {
        count: 1,
        targets: [
          {
            target_id: "p1",
            target_kind: "url",
            target_identity: "https://npmjs.com/package/foo",
            scan_id: "s1",
            run_id: "r1",
            signal_type: "trending.npm.dependents",
            produced_at: "2026-05-13T10:00:00Z",
            fields: {
              package: "foo",
              dependents_count: "not-a-number",
              fetched_at: "2026-05-13T09:00:00Z",
            },
          },
        ],
      },
    }),
  });
  assert.ok(result);
  assert.equal(result!.foo.count, null);
});
