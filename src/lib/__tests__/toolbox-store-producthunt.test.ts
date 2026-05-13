import { test } from "node:test";
import assert from "node:assert/strict";

import { fetchProducthuntLaunchesFromToolbox } from "../toolbox-store-producthunt";

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

test("PH: shapes happy-path response into ProductHuntFile", async () => {
  const result = await fetchProducthuntLaunchesFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({
      body: {
        count: 1,
        targets: [
          {
            target_id: "p1",
            target_kind: "url",
            target_identity: "https://producthunt.com/posts/1128324",
            scan_id: "scan",
            run_id: "run",
            signal_type: "trending.producthunt.launches",
            produced_at: "2026-05-13T00:06:18Z",
            fields: {
              id: "1128324",
              name: "RankSpot",
              tagline: "AI SEO Blog driven by deep competitor intelligence",
              thumbnail: "https://ph-files.imgix.net/x.png",
              topics: ["marketing", "seo"],
              votes_count: 470,
              comments_count: 75,
              created_at: "2026-05-08T07:01:00Z",
              makers: [
                {
                  name: "Alice",
                  username: "alice",
                  twitterUsername: null,
                  websiteUrl: null,
                },
              ],
            },
          },
        ],
      },
    }),
  });

  assert.ok(result);
  assert.equal(result!.windowDays, 7);
  assert.equal(result!.launches.length, 1);
  const l = result!.launches[0];
  assert.equal(l.id, "1128324");
  assert.equal(l.name, "RankSpot");
  assert.equal(l.votesCount, 470);
  assert.equal(l.thumbnail, "https://ph-files.imgix.net/x.png");
  // Field-coverage caveats: these intentionally degrade.
  assert.equal(l.description, "");
  assert.equal(l.url, "");
  assert.equal(l.website, null);
  assert.equal(l.githubUrl, null);
  assert.equal(l.linkedRepo, null);
  assert.equal(l.aiAdjacent, undefined);
  // daysSinceLaunch computed from created_at.
  assert.ok(typeof l.daysSinceLaunch === "number");
  assert.ok(l.daysSinceLaunch >= 0);
  // 1 maker preserved.
  assert.equal(l.makers.length, 1);
  assert.equal(l.makers[0].name, "Alice");
});

test("PH: returns null on HTTP error", async () => {
  const result = await fetchProducthuntLaunchesFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({ status: 404 }),
  });
  assert.equal(result, null);
});

test("PH: skips events with missing id", async () => {
  const result = await fetchProducthuntLaunchesFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({
      body: {
        count: 2,
        targets: [
          {
            target_id: "p1",
            target_kind: "url",
            target_identity: "https://producthunt.com/posts/keeper",
            scan_id: "scan",
            run_id: "run",
            signal_type: "trending.producthunt.launches",
            produced_at: "2026-05-13T00:00:00Z",
            fields: {
              id: "keeper",
              name: "Keeper",
              tagline: "k",
              created_at: "2026-05-10T00:00:00Z",
            },
          },
          {
            target_id: "p2",
            target_kind: "url",
            target_identity: "https://producthunt.com/posts/anon",
            scan_id: "scan",
            run_id: "run",
            signal_type: "trending.producthunt.launches",
            produced_at: "2026-05-13T00:00:00Z",
            fields: {
              name: "NoId",
              tagline: "x",
              created_at: "2026-05-11T00:00:00Z",
            },
          },
        ],
      },
    }),
  });
  assert.ok(result);
  assert.equal(result!.launches.length, 1);
  assert.equal(result!.launches[0].id, "keeper");
});

test("PH: sorts newest-first by created_at", async () => {
  const result = await fetchProducthuntLaunchesFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({
      body: {
        count: 3,
        targets: [
          {
            target_id: "a",
            target_kind: "url",
            target_identity: "https://producthunt.com/posts/old",
            scan_id: "scan",
            run_id: "run",
            signal_type: "trending.producthunt.launches",
            produced_at: "2026-05-13T00:00:00Z",
            fields: {
              id: "old",
              name: "Old",
              tagline: "t",
              created_at: "2026-05-08T00:00:00Z",
            },
          },
          {
            target_id: "b",
            target_kind: "url",
            target_identity: "https://producthunt.com/posts/new",
            scan_id: "scan",
            run_id: "run",
            signal_type: "trending.producthunt.launches",
            produced_at: "2026-05-13T00:00:00Z",
            fields: {
              id: "new",
              name: "New",
              tagline: "t",
              created_at: "2026-05-12T00:00:00Z",
            },
          },
          {
            target_id: "c",
            target_kind: "url",
            target_identity: "https://producthunt.com/posts/mid",
            scan_id: "scan",
            run_id: "run",
            signal_type: "trending.producthunt.launches",
            produced_at: "2026-05-13T00:00:00Z",
            fields: {
              id: "mid",
              name: "Mid",
              tagline: "t",
              created_at: "2026-05-10T00:00:00Z",
            },
          },
        ],
      },
    }),
  });
  assert.ok(result);
  assert.deepEqual(
    result!.launches.map((l) => l.id),
    ["new", "mid", "old"],
  );
});

test("PH: drops makers with no name or username", async () => {
  const result = await fetchProducthuntLaunchesFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({
      body: {
        count: 1,
        targets: [
          {
            target_id: "p1",
            target_kind: "url",
            target_identity: "https://producthunt.com/posts/x",
            scan_id: "scan",
            run_id: "run",
            signal_type: "trending.producthunt.launches",
            produced_at: "2026-05-13T00:00:00Z",
            fields: {
              id: "x",
              name: "X",
              tagline: "t",
              created_at: "2026-05-12T00:00:00Z",
              makers: [
                { name: "Alice", username: "alice" },
                { name: "", username: "" }, // blank, drop
                "not-an-object", // wrong type, drop
              ],
            },
          },
        ],
      },
    }),
  });
  assert.ok(result);
  assert.equal(result!.launches[0].makers.length, 1);
});
