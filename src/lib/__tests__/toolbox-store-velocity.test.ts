import { test } from "node:test";
import assert from "node:assert/strict";

import { fetchDeltasFromToolbox } from "../toolbox-store-velocity";

function fakeFetch(
  responses: Array<{ status?: number; body?: unknown; throwError?: Error }>,
): typeof fetch {
  let callIdx = 0;
  return (async () => {
    const r = responses[callIdx] ?? responses[responses.length - 1];
    callIdx += 1;
    if (r.throwError) throw r.throwError;
    return {
      ok: (r.status ?? 200) >= 200 && (r.status ?? 200) < 300,
      status: r.status ?? 200,
      json: async () => r.body,
    } as Response;
  }) as unknown as typeof fetch;
}

// trending.ts seeds `getFullNameToRepoId()` from the bundled `data/trending.json`.
// Pull a repo_id we know exists so the reverse-map join hits. Using a repo we
// expect to be in any trending snapshot.
async function pickAnyKnownFullName(): Promise<{ fullName: string; repoId: string } | null> {
  const { getFullNameToRepoId } = await import("../trending");
  const map = getFullNameToRepoId();
  const first = map.entries().next();
  if (first.done) return null;
  return { fullName: first.value[0], repoId: first.value[1] };
}

test("returns DeltasJson with stars + fork merge for a known repo", async () => {
  const known = await pickAnyKnownFullName();
  assert.ok(known, "bundled trending.json must have at least one repo");
  const result = await fetchDeltasFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test",
    fetchImpl: fakeFetch([
      // Stars response
      {
        body: {
          count: 1,
          targets: [
            {
              target_id: "t1",
              target_kind: "url",
              target_identity: `https://github.com/${known.fullName}`,
              scan_id: "s",
              run_id: "r",
              signal_type: "trending.github.stars.velocity",
              produced_at: "2026-05-13T03:00:00Z",
              fields: {
                stars_now: 100,
                delta_1h: 0,
                delta_1h_basis: "exact",
                delta_24h: 5,
                delta_24h_basis: "nearest",
                delta_7d: 12,
                delta_7d_basis: "cold-start",
                delta_30d: 40,
                delta_30d_basis: "nearest",
              },
            },
          ],
        },
      },
      // Fork response
      {
        body: {
          count: 1,
          targets: [
            {
              target_id: "t1",
              target_kind: "url",
              target_identity: `https://github.com/${known.fullName}`,
              scan_id: "s",
              run_id: "r",
              signal_type: "trending.github.fork.velocity",
              produced_at: "2026-05-13T03:00:00Z",
              fields: {
                forks_now: 7,
                fork_delta_1h: 0,
                fork_delta_24h: 1,
                fork_delta_7d: 3,
                fork_delta_30d: 5,
              },
            },
          ],
        },
      },
    ]),
  });

  assert.ok(result, "expected non-null DeltasJson");
  const entry = result!.repos[known.repoId];
  assert.ok(entry, `expected entry for repoId ${known.repoId} (fullName=${known.fullName})`);
  assert.equal(entry.stars_now, 100);
  assert.equal(entry.forks_now, 7);
  // Stars side: basis correctly preserved
  assert.equal(entry.delta_1h.basis, "exact");
  assert.equal(entry.delta_24h.basis, "nearest");
  assert.equal(entry.delta_7d.basis, "cold-start");
  // Cold-start variant: age_seconds falls back to 0 when upstream payload
  // doesn't include `delta_<win>_age_seconds` (legacy/backward-compat case).
  // Post-PR #1186 the dual-write emits this field; see next test.
  if (entry.delta_7d.basis === "cold-start") {
    assert.equal(entry.delta_7d.age_seconds, 0);
  }
  // Fork side: backward-compat — fixture omits fork_delta_<win>_basis, so
  // basis degrades to "no-history". Post-PR #1186 fixture (next test)
  // verifies basis + age_seconds are consumed when present.
  assert.equal(entry.fork_delta_1h!.basis, "no-history");
  assert.equal(entry.fork_delta_24h!.basis, "no-history");
});

test("consumes new fork_delta_<win>_basis + *_age_seconds fields (post PR #1186)", async () => {
  const known = await pickAnyKnownFullName();
  assert.ok(known);
  const result = await fetchDeltasFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test",
    fetchImpl: fakeFetch([
      // Stars response with cold-start age_seconds
      {
        body: {
          count: 1,
          targets: [
            {
              target_id: "t1",
              target_kind: "url",
              target_identity: `https://github.com/${known.fullName}`,
              scan_id: "s",
              run_id: "r",
              signal_type: "trending.github.stars.velocity",
              produced_at: "2026-05-13T10:00:00Z",
              fields: {
                stars_now: 1000,
                delta_24h: 50,
                delta_24h_basis: "cold-start",
                delta_24h_age_seconds: 86400,
              },
            },
          ],
        },
      },
      // Fork response WITH basis + age_seconds (the new shape)
      {
        body: {
          count: 1,
          targets: [
            {
              target_id: "t1",
              target_kind: "url",
              target_identity: `https://github.com/${known.fullName}`,
              scan_id: "s",
              run_id: "r",
              signal_type: "trending.github.fork.velocity",
              produced_at: "2026-05-13T10:00:00Z",
              fields: {
                forks_now: 200,
                fork_delta_1h: 2,
                fork_delta_1h_basis: "exact",
                fork_delta_24h: 10,
                fork_delta_24h_basis: "cold-start",
                fork_delta_24h_age_seconds: 7200,
              },
            },
          ],
        },
      },
    ]),
  });

  assert.ok(result);
  const entry = result!.repos[known.repoId];
  assert.ok(entry);
  // Stars cold-start: age_seconds passed through
  if (entry.delta_24h.basis === "cold-start") {
    assert.equal(entry.delta_24h.age_seconds, 86400);
  } else {
    assert.fail(`expected cold-start basis, got ${entry.delta_24h.basis}`);
  }
  // Fork basis now PRESERVED (not "no-history")
  assert.equal(entry.fork_delta_1h!.basis, "exact");
  // Fork cold-start age_seconds also passed through
  if (entry.fork_delta_24h!.basis === "cold-start") {
    assert.equal(entry.fork_delta_24h!.age_seconds, 7200);
  } else {
    assert.fail(`expected fork cold-start basis, got ${entry.fork_delta_24h!.basis}`);
  }
});

test("returns null when both stars + fork responses fail", async () => {
  const result = await fetchDeltasFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test",
    fetchImpl: fakeFetch([{ status: 502 }, { status: 502 }]),
  });
  assert.equal(result, null);
});

test("returns null on network throw across both", async () => {
  const result = await fetchDeltasFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test",
    fetchImpl: fakeFetch([
      { throwError: new Error("ECONNRESET") },
      { throwError: new Error("ECONNRESET") },
    ]),
  });
  assert.equal(result, null);
});

test("returns partial DeltasJson when only stars side succeeds", async () => {
  const known = await pickAnyKnownFullName();
  assert.ok(known);
  const result = await fetchDeltasFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test",
    fetchImpl: fakeFetch([
      {
        body: {
          count: 1,
          targets: [
            {
              target_id: "t1",
              target_kind: "url",
              target_identity: `https://github.com/${known.fullName}`,
              scan_id: "s",
              run_id: "r",
              signal_type: "trending.github.stars.velocity",
              produced_at: "2026-05-13T03:00:00Z",
              fields: { stars_now: 50, delta_1h: 0, delta_1h_basis: "exact" },
            },
          ],
        },
      },
      { status: 503 }, // Fork fetch fails
    ]),
  });
  assert.ok(result, "stars-only success should still produce a DeltasJson");
  const entry = result!.repos[known.repoId];
  assert.ok(entry);
  assert.equal(entry.stars_now, 50);
  assert.equal(entry.forks_now, undefined);
});

test("skips events for repos not in the trending reverse-map", async () => {
  const result = await fetchDeltasFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test",
    fetchImpl: fakeFetch([
      {
        body: {
          count: 1,
          targets: [
            {
              target_id: "t1",
              target_kind: "url",
              target_identity: "https://github.com/definitely/not-trending-xyz123",
              scan_id: "s",
              run_id: "r",
              signal_type: "trending.github.stars.velocity",
              produced_at: "2026-05-13T03:00:00Z",
              fields: { stars_now: 9999, delta_1h: 0, delta_1h_basis: "exact" },
            },
          ],
        },
      },
      { body: { count: 0, targets: [] } },
    ]),
  });
  assert.ok(result);
  // Repo not in trending → no entry in deltas
  assert.equal(Object.keys(result!.repos).length, 0);
});

test("skips events with non-github target_identity", async () => {
  const result = await fetchDeltasFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test",
    fetchImpl: fakeFetch([
      {
        body: {
          count: 1,
          targets: [
            {
              target_id: "t1",
              target_kind: "url",
              target_identity: "https://example.com/not-a-repo",
              scan_id: "s",
              run_id: "r",
              signal_type: "trending.github.stars.velocity",
              produced_at: "2026-05-13T03:00:00Z",
              fields: { stars_now: 1, delta_1h: 0, delta_1h_basis: "exact" },
            },
          ],
        },
      },
      { body: { count: 0, targets: [] } },
    ]),
  });
  assert.ok(result);
  assert.equal(Object.keys(result!.repos).length, 0);
});

test("buildDeltaValue degrades unknown basis to no-history", async () => {
  const known = await pickAnyKnownFullName();
  assert.ok(known);
  const result = await fetchDeltasFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test",
    fetchImpl: fakeFetch([
      {
        body: {
          count: 1,
          targets: [
            {
              target_id: "t1",
              target_kind: "url",
              target_identity: `https://github.com/${known.fullName}`,
              scan_id: "s",
              run_id: "r",
              signal_type: "trending.github.stars.velocity",
              produced_at: "2026-05-13T03:00:00Z",
              fields: {
                stars_now: 1,
                delta_1h: 5,
                delta_1h_basis: "mystery-basis-from-future",
              },
            },
          ],
        },
      },
      { body: { count: 0, targets: [] } },
    ]),
  });
  assert.ok(result);
  const entry = result!.repos[known.repoId];
  assert.equal(entry.delta_1h.basis, "no-history");
  assert.equal(entry.delta_1h.value, null);
});

test("computedAt reflects max produced_at across both signals", async () => {
  const known = await pickAnyKnownFullName();
  assert.ok(known);
  const result = await fetchDeltasFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test",
    fetchImpl: fakeFetch([
      {
        body: {
          count: 1,
          targets: [
            {
              target_id: "t1",
              target_kind: "url",
              target_identity: `https://github.com/${known.fullName}`,
              scan_id: "s",
              run_id: "r",
              signal_type: "trending.github.stars.velocity",
              produced_at: "2026-05-13T01:00:00Z",
              fields: { stars_now: 1, delta_1h: 0, delta_1h_basis: "exact" },
            },
          ],
        },
      },
      {
        body: {
          count: 1,
          targets: [
            {
              target_id: "t1",
              target_kind: "url",
              target_identity: `https://github.com/${known.fullName}`,
              scan_id: "s",
              run_id: "r",
              signal_type: "trending.github.fork.velocity",
              produced_at: "2026-05-13T05:30:00Z",
              fields: { forks_now: 1, fork_delta_1h: 0 },
            },
          ],
        },
      },
    ]),
  });
  assert.ok(result);
  assert.equal(result!.computedAt, "2026-05-13T05:30:00.000Z");
});
