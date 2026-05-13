import { test } from "node:test";
import assert from "node:assert/strict";

import { fetchHnMentionsFromToolbox } from "../toolbox-store";

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

test("returns shaped HnMentionsFile on happy-path response", async () => {
  const result = await fetchHnMentionsFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({
      body: {
        count: 2,
        targets: [
          {
            target_id: "t1",
            target_kind: "url",
            target_identity: "https://github.com/vercel/next.js",
            scan_id: "s1",
            run_id: "r1",
            signal_type: "trending.hn.mentions",
            produced_at: "2026-05-13T03:00:00Z",
            fields: {
              count_7d: 12,
              score_sum_7d: 1500,
              ever_hit_front_page: true,
              top_story: { id: 1, title: "...", score: 300, url: "...", hoursSincePosted: 4 },
              stories_top10: [],
            },
          },
          {
            target_id: "t2",
            target_kind: "url",
            target_identity: "https://github.com/openai/whisper",
            scan_id: "s1",
            run_id: "r2",
            signal_type: "trending.hn.mentions",
            produced_at: "2026-05-13T02:00:00Z",
            fields: {
              count_7d: 5,
              score_sum_7d: 800,
              ever_hit_front_page: false,
              stories_top10: [],
            },
          },
        ],
      },
    }),
  });

  assert.ok(result, "expected a non-null HnMentionsFile");
  assert.equal(Object.keys(result!.mentions).length, 2);
  assert.ok(result!.mentions["vercel/next.js"]);
  assert.equal(result!.mentions["vercel/next.js"].count7d, 12);
  assert.equal(result!.mentions["vercel/next.js"].scoreSum7d, 1500);
  assert.equal(result!.mentions["vercel/next.js"].everHitFrontPage, true);
  assert.equal(result!.mentions["openai/whisper"].topStory, null);
  assert.equal(result!.windowDays, 7);
  assert.equal(result!.fetchedAt, "2026-05-13T03:00:00.000Z");
});

test("leaderboard is sorted by scoreSum7d desc", async () => {
  const result = await fetchHnMentionsFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({
      body: {
        count: 3,
        targets: [
          {
            target_id: "t1",
            target_kind: "url",
            target_identity: "https://github.com/a/low",
            scan_id: "s",
            run_id: "r",
            signal_type: "trending.hn.mentions",
            produced_at: "2026-05-13T03:00:00Z",
            fields: { count_7d: 1, score_sum_7d: 10, ever_hit_front_page: false, stories_top10: [] },
          },
          {
            target_id: "t2",
            target_kind: "url",
            target_identity: "https://github.com/b/high",
            scan_id: "s",
            run_id: "r",
            signal_type: "trending.hn.mentions",
            produced_at: "2026-05-13T03:00:00Z",
            fields: { count_7d: 9, score_sum_7d: 999, ever_hit_front_page: false, stories_top10: [] },
          },
          {
            target_id: "t3",
            target_kind: "url",
            target_identity: "https://github.com/c/mid",
            scan_id: "s",
            run_id: "r",
            signal_type: "trending.hn.mentions",
            produced_at: "2026-05-13T03:00:00Z",
            fields: { count_7d: 5, score_sum_7d: 500, ever_hit_front_page: false, stories_top10: [] },
          },
        ],
      },
    }),
  });
  assert.ok(result);
  assert.deepEqual(
    result!.leaderboard.map((r) => r.fullName),
    ["b/high", "c/mid", "a/low"],
  );
});

test("returns null on non-2xx response", async () => {
  const result = await fetchHnMentionsFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({ status: 503 }),
  });
  assert.equal(result, null);
});

test("returns null on fetch throw (network error)", async () => {
  const result = await fetchHnMentionsFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({ throwError: new Error("ECONNREFUSED") }),
  });
  assert.equal(result, null);
});

test("returns null when response body is malformed (no targets array)", async () => {
  const result = await fetchHnMentionsFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({ body: { count: 0 } }),
  });
  assert.equal(result, null);
});

test("skips events with non-github target_identity", async () => {
  const result = await fetchHnMentionsFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({
      body: {
        count: 2,
        targets: [
          {
            target_id: "t1",
            target_kind: "url",
            target_identity: "https://example.com/not-a-repo",
            scan_id: "s",
            run_id: "r",
            signal_type: "trending.hn.mentions",
            produced_at: "2026-05-13T03:00:00Z",
            fields: { count_7d: 99, score_sum_7d: 99, ever_hit_front_page: false, stories_top10: [] },
          },
          {
            target_id: "t2",
            target_kind: "url",
            target_identity: "https://github.com/real/repo",
            scan_id: "s",
            run_id: "r",
            signal_type: "trending.hn.mentions",
            produced_at: "2026-05-13T03:00:00Z",
            fields: { count_7d: 3, score_sum_7d: 30, ever_hit_front_page: false, stories_top10: [] },
          },
        ],
      },
    }),
  });
  assert.ok(result);
  assert.equal(Object.keys(result!.mentions).length, 1);
  assert.ok(result!.mentions["real/repo"]);
});

test("skips events lacking count_7d field", async () => {
  const result = await fetchHnMentionsFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({
      body: {
        count: 1,
        targets: [
          {
            target_id: "t1",
            target_kind: "url",
            target_identity: "https://github.com/x/y",
            scan_id: "s",
            run_id: "r",
            signal_type: "trending.hn.mentions",
            produced_at: "2026-05-13T03:00:00Z",
            fields: { score_sum_7d: 100, ever_hit_front_page: false, stories_top10: [] },
          },
        ],
      },
    }),
  });
  assert.ok(result);
  assert.equal(Object.keys(result!.mentions).length, 0);
  assert.equal(result!.leaderboard.length, 0);
});

test("builds mentionsByRepoId with slugified keys", async () => {
  const result = await fetchHnMentionsFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({
      body: {
        count: 1,
        targets: [
          {
            target_id: "t1",
            target_kind: "url",
            target_identity: "https://github.com/Vercel/Next.JS",
            scan_id: "s",
            run_id: "r",
            signal_type: "trending.hn.mentions",
            produced_at: "2026-05-13T03:00:00Z",
            fields: { count_7d: 1, score_sum_7d: 1, ever_hit_front_page: false, stories_top10: [] },
          },
        ],
      },
    }),
  });
  assert.ok(result);
  // Slugifier preserves the source case for `mentions` keys; `mentionsByRepoId`
  // lowercases + replaces `/` and `.`.
  assert.ok(result!.mentionsByRepoId);
  assert.ok(result!.mentionsByRepoId!["vercel--next-js"]);
});
