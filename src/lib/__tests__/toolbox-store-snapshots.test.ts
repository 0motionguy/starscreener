import { test } from "node:test";
import assert from "node:assert/strict";

import {
  fetchArxivFromToolbox,
  fetchClaudeRssFromToolbox,
  fetchLobstersTrendingFromToolbox,
} from "../toolbox-store-snapshots";

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

// ---------------------------------------------------------------------------
// arXiv
// ---------------------------------------------------------------------------

test("arxiv: shapes happy-path response into ArxivRecentFile", async () => {
  const result = await fetchArxivFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({
      body: {
        count: 1,
        targets: [
          {
            target_id: "a1",
            target_kind: "url",
            target_identity: "https://arxiv.org/list/ai",
            scan_id: "scan1",
            run_id: "run1",
            signal_type: "trending.arxiv",
            produced_at: "2026-05-13T10:00:00Z",
            fields: {
              count: 2,
              items: [
                {
                  arxivId: "2605.11111",
                  title: "Paper One",
                  summary: "S1",
                  authors: ["Alice"],
                  categories: ["cs.AI"],
                  absUrl: "https://arxiv.org/abs/2605.11111",
                  pdfUrl: "https://arxiv.org/pdf/2605.11111",
                  publishedAt: "2026-05-13T09:00:00Z",
                  updatedAt: "2026-05-13T09:30:00Z",
                  linkedRepos: [],
                },
                {
                  arxivId: "2605.22222",
                  title: "Paper Two",
                  summary: "S2",
                  authors: ["Bob"],
                  categories: ["cs.LG"],
                  absUrl: "https://arxiv.org/abs/2605.22222",
                  pdfUrl: "https://arxiv.org/pdf/2605.22222",
                  publishedAt: "2026-05-13T08:00:00Z",
                  updatedAt: "2026-05-13T08:00:00Z",
                  linkedRepos: [
                    { fullName: "owner/repo", matchType: "url", confidence: 0.9 },
                  ],
                },
              ],
            },
          },
        ],
      },
    }),
  });

  assert.ok(result);
  assert.equal(result!.source, "toolbox:trending.arxiv");
  assert.equal(result!.papers.length, 2);
  assert.equal(result!.linkedRepoCount, 1);
  // Newest-first
  assert.equal(result!.papers[0].arxivId, "2605.11111");
  assert.equal(result!.papers[0].linkedRepos.length, 0);
  // primaryCategory defaults to null
  assert.equal(result!.papers[0].primaryCategory, null);
});

test("arxiv: de-dupes by arxivId across multiple targets", async () => {
  const result = await fetchArxivFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({
      body: {
        count: 2,
        targets: [
          {
            target_id: "a1",
            target_kind: "url",
            target_identity: "https://arxiv.org/list/ai",
            scan_id: "s1",
            run_id: "r1",
            signal_type: "trending.arxiv",
            produced_at: "2026-05-13T10:00:00Z",
            fields: {
              items: [
                {
                  arxivId: "2605.99",
                  title: "Dup",
                  publishedAt: "2026-05-13T09:00:00Z",
                  absUrl: "u",
                  pdfUrl: "p",
                  updatedAt: "2026-05-13T09:00:00Z",
                },
              ],
            },
          },
          {
            target_id: "a2",
            target_kind: "url",
            target_identity: "https://arxiv.org/list/ml",
            scan_id: "s1",
            run_id: "r2",
            signal_type: "trending.arxiv",
            produced_at: "2026-05-13T10:00:00Z",
            fields: {
              items: [
                {
                  arxivId: "2605.99",
                  title: "Dup",
                  publishedAt: "2026-05-13T09:00:00Z",
                  absUrl: "u",
                  pdfUrl: "p",
                  updatedAt: "2026-05-13T09:00:00Z",
                },
              ],
            },
          },
        ],
      },
    }),
  });
  assert.ok(result);
  assert.equal(result!.papers.length, 1);
});

test("arxiv: returns null on HTTP error", async () => {
  const result = await fetchArxivFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({ status: 500 }),
  });
  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// Claude RSS
// ---------------------------------------------------------------------------

test("claude.rss: shapes happy-path response into RssFile", async () => {
  const result = await fetchClaudeRssFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({
      body: {
        count: 1,
        targets: [
          {
            target_id: "c1",
            target_kind: "url",
            target_identity: "https://www.anthropic.com/rss",
            scan_id: "s1",
            run_id: "r1",
            signal_type: "trending.claude.rss",
            produced_at: "2026-05-13T10:00:00Z",
            fields: {
              items: [
                {
                  id: "https://anthropic.com/post-1",
                  url: "https://anthropic.com/post-1",
                  title: "Post 1",
                  author: "Anthropic",
                  source: "claude",
                  summary: "summary",
                  category: "NEWS",
                  publishedAt: "2026-05-12T10:00:00Z",
                },
              ],
            },
          },
        ],
      },
    }),
  });

  assert.ok(result);
  assert.equal(result!.source, "claude");
  assert.equal(result!.items.length, 1);
  assert.equal(result!.items[0].title, "Post 1");
  assert.equal(result!.items[0].source, "claude");
  assert.equal(result!.error, null);
});

test("claude.rss: drops items without id or url", async () => {
  const result = await fetchClaudeRssFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({
      body: {
        count: 1,
        targets: [
          {
            target_id: "c1",
            target_kind: "url",
            target_identity: "https://example",
            scan_id: "s1",
            run_id: "r1",
            signal_type: "trending.claude.rss",
            produced_at: "2026-05-13T10:00:00Z",
            fields: {
              items: [
                { id: "u", url: "u", title: "ok", publishedAt: "2026-05-12T00:00:00Z" },
                { title: "no-id-url" },
                "not-an-object",
              ],
            },
          },
        ],
      },
    }),
  });
  assert.ok(result);
  assert.equal(result!.items.length, 1);
});

// ---------------------------------------------------------------------------
// Lobsters trending
// ---------------------------------------------------------------------------

test("lobsters: shapes happy-path response into LobstersTrendingFile", async () => {
  const result = await fetchLobstersTrendingFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({
      body: {
        count: 1,
        targets: [
          {
            target_id: "l1",
            target_kind: "url",
            target_identity: "https://lobste.rs",
            scan_id: "s1",
            run_id: "r1",
            signal_type: "trending.lobsters",
            produced_at: "2026-05-13T10:00:00Z",
            fields: {
              items: [
                {
                  shortId: "n5ytdh",
                  title: "Sample story",
                  url: "https://lobste.rs/s/n5ytdh",
                  storyUrl: "https://example.com/story",
                  submitter: "alice",
                  score: 100,
                  commentCount: 5,
                  publishedAt: "2026-05-12T10:00:00Z",
                  tags: ["lang", "tools"],
                },
              ],
            },
          },
        ],
      },
    }),
  });

  assert.ok(result);
  assert.equal(result!.windowHours, 72);
  assert.equal(result!.stories.length, 1);
  const s = result!.stories[0];
  assert.equal(s.shortId, "n5ytdh");
  // url = storyUrl (linked article), commentsUrl = lobsters discussion page
  assert.equal(s.url, "https://example.com/story");
  assert.equal(s.commentsUrl, "https://lobste.rs/s/n5ytdh");
  assert.equal(s.by, "alice");
  // createdUtc = floor(parsed-ms / 1000)
  assert.equal(
    s.createdUtc,
    Math.floor(Date.parse("2026-05-12T10:00:00Z") / 1000),
  );
});

test("lobsters: returns null on body without targets", async () => {
  const result = await fetchLobstersTrendingFromToolbox({
    apiUrl: "https://api.example.test",
    apiKey: "tbk_live_test_key",
    fetchImpl: fakeFetch({ body: { count: 0 } }),
  });
  assert.equal(result, null);
});
