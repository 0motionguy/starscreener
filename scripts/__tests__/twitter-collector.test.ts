import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTwitterCollectorPayload,
  decodeHtmlEntities,
  extractNitterNextPageUrl,
  normalizeNitterInstances,
  nitterSearchUrls,
  parseCompactCount,
  parseNitterHtml,
  parseNitterRss,
} from "../_twitter-collector";
import type {
  TwitterQuery,
  TwitterScanCandidate,
} from "../../src/lib/twitter/types";

const candidate: TwitterScanCandidate = {
  priorityRank: 1,
  priorityScore: 100,
  priorityReason: "test",
  lastScannedAt: null,
  repo: {
    repoId: "anthropic--claude-code",
    githubFullName: "anthropic/claude-code",
    githubUrl: "https://github.com/anthropic/claude-code",
    repoName: "claude-code",
    ownerName: "anthropic",
    homepageUrl: "https://claude.ai/code",
    docsUrl: "https://docs.anthropic.com/claude-code",
    packageNames: ["@anthropic-ai/claude-code"],
    aliases: ["Claude Code"],
    description: "Agentic coding CLI",
  },
};

const repoSlugQuery: TwitterQuery = {
  queryText: "anthropic/claude-code",
  queryType: "repo_slug",
  tier: 1,
  confidenceWeight: 1,
  enabled: true,
  rationale: "Exact GitHub repo slug",
};

const phraseQuery: TwitterQuery = {
  queryText: "\"Claude Code\"",
  queryType: "project_name",
  tier: 2,
  confidenceWeight: 0.84,
  enabled: true,
  rationale: "Quoted project name",
};

test("decodeHtmlEntities handles named and numeric entities", () => {
  assert.equal(
    decodeHtmlEntities("Claude &amp; Code &#35;1 &#x1f525;"),
    "Claude & Code #1 \u{1f525}",
  );
});

test("parseCompactCount supports k/m suffixes", () => {
  assert.equal(parseCompactCount("1.2K"), 1200);
  assert.equal(parseCompactCount("3,400"), 3400);
  assert.equal(parseCompactCount("2.5M"), 2_500_000);
});

test("normalizeNitterInstances dedupes and adds scheme", () => {
  assert.deepEqual(normalizeNitterInstances("xcancel.com,https://xcancel.com/"), [
    "https://xcancel.com",
  ]);
});

test("nitterSearchUrls prefers HTML search so engagement stats are available", () => {
  assert.deepEqual(nitterSearchUrls("https://xcancel.com", "owner/repo"), [
    "https://xcancel.com/search?f=tweets&q=owner%2Frepo",
    "https://xcancel.com/search/rss?f=tweets&q=owner%2Frepo",
  ]);
});

test("extractNitterNextPageUrl reads cursor pagination links", () => {
  const html = `
    <div class="show-more">
      <a href="/search?f=tweets&amp;q=owner%2Frepo&amp;cursor=DAABCg">Load more</a>
    </div>`;

  assert.equal(
    extractNitterNextPageUrl(
      html,
      "https://xcancel.com/search?f=tweets&q=owner%2Frepo",
    ),
    "https://xcancel.com/search?f=tweets&q=owner%2Frepo&cursor=DAABCg",
  );
});

test("parseNitterRss extracts canonical X post fields", () => {
  const rss = `<?xml version="1.0"?>
  <rss><channel>
    <item>
      <title>devA: anthropic/claude-code is moving</title>
      <link>https://xcancel.com/devA/status/1891234567801#m</link>
      <pubDate>Wed, 22 Apr 2026 11:52:00 GMT</pubDate>
      <description><![CDATA[https://github.com/anthropic/claude-code is the fastest CLI workflow.]]></description>
      <dc:creator>@devA</dc:creator>
    </item>
  </channel></rss>`;

  const posts = parseNitterRss(rss, "https://xcancel.com/search/rss?q=x");

  assert.equal(posts.length, 1);
  assert.equal(posts[0]?.postId, "1891234567801");
  assert.equal(posts[0]?.postUrl, "https://x.com/devA/status/1891234567801");
  assert.equal(posts[0]?.authorHandle, "devA");
  assert.equal(posts[0]?.postedAt, "2026-04-22T11:52:00.000Z");
  assert.match(posts[0]?.text ?? "", /github\.com\/anthropic\/claude-code/);
});

test("parseNitterHtml extracts text and engagement stats", () => {
  const html = `
    <div class="timeline-item">
      <a class="tweet-link" href="/devB/status/1891234567802#m"></a>
      <a class="tweet-date" title="Apr 22, 2026 · 10:40 AM UTC"></a>
      <a class="username" href="/devB">@devB</a>
      <div class="tweet-content media-body">Claude Code is clean for repo-aware edits</div>
      <span class="icon-comment"></span><span class="tweet-stat">4</span>
      <span class="icon-retweet"></span><span class="tweet-stat">1.2K</span>
      <span class="icon-quote"></span><span class="tweet-stat">6</span>
      <span class="icon-heart"></span><span class="tweet-stat">2.5K</span>
    </div>`;

  const posts = parseNitterHtml(html, "https://xcancel.com/search?q=x");

  assert.equal(posts.length, 1);
  assert.equal(posts[0]?.postUrl, "https://x.com/devB/status/1891234567802");
  assert.equal(posts[0]?.authorHandle, "devB");
  assert.equal(posts[0]?.likes, 2500);
  assert.equal(posts[0]?.reposts, 1200);
  assert.equal(posts[0]?.replies, 4);
  assert.equal(posts[0]?.quotes, 6);
});

test("parseNitterHtml reads current nested tweet-stat markup", () => {
  const html = `
    <div class="timeline-item">
      <a class="tweet-link" href="/devB/status/1891234567810#m"></a>
      <span class="tweet-date"><a title="Apr 22, 2026 · 10:40 AM UTC">Apr 22</a></span>
      <div class="tweet-content media-body">Claude Code is clean for repo-aware edits</div>
      <div class="tweet-stats">
        <span class="tweet-stat"><div class="icon-container"><span class="icon-comment"></span> 4</div></span>
        <span class="tweet-stat"><div class="icon-container"><span class="icon-retweet"></span> 1.2K</div></span>
        <span class="tweet-stat"><div class="icon-container"><span class="icon-quote"></span> 6</div></span>
        <span class="tweet-stat"><div class="icon-container"><span class="icon-heart"></span> 2.5K</div></span>
      </div>
    </div>`;

  const posts = parseNitterHtml(html, "https://nitter.tiekoetter.com/search?q=x");

  assert.equal(posts.length, 1);
  assert.equal(posts[0]?.likes, 2500);
  assert.equal(posts[0]?.reposts, 1200);
  assert.equal(posts[0]?.replies, 4);
  assert.equal(posts[0]?.quotes, 6);
});

test("parseNitterHtml keeps status URL handle instead of display name", () => {
  const html = `
    <div class="timeline-item">
      <a class="tweet-link" href="/real_handle/status/1891234567804#m"></a>
      <a class="tweet-date" title="Apr 22, 2026 Â· 10:42 AM UTC"></a>
      <div class="fullname-and-username">
        <a class="fullname" href="/real_handle">Display Name</a>
        <a class="username" href="/real_handle">@real_handle</a>
      </div>
      <div class="tweet-content media-body">Claude Code is clean for repo-aware edits</div>
    </div>`;

  const posts = parseNitterHtml(html, "https://xcancel.com/search?q=x");

  assert.equal(posts.length, 1);
  assert.equal(posts[0]?.postUrl, "https://x.com/real_handle/status/1891234567804");
  assert.equal(posts[0]?.authorHandle, "real_handle");
});

test("buildTwitterCollectorPayload matches posts to existing ingest contract", () => {
  const postsByQuery = new Map([
    [
      repoSlugQuery.queryText,
      [
        {
          postId: "1891234567801",
          postUrl: "https://x.com/devA/status/1891234567801",
          authorHandle: "devA",
          postedAt: "2026-04-22T11:52:00.000Z",
          text: "https://github.com/anthropic/claude-code is the fastest CLI workflow.",
          likes: 10,
          reposts: 4,
          replies: 1,
          quotes: 0,
        },
      ],
    ],
    [
      phraseQuery.queryText,
      [
        {
          postId: "1891234567802",
          postUrl: "https://x.com/devB/status/1891234567802",
          authorHandle: "devB",
          postedAt: "2026-04-22T11:40:00.000Z",
          text: "Claude Code keeps getting better for repo-aware edits.",
          likes: 8,
          reposts: 1,
          replies: 0,
          quotes: 0,
        },
      ],
    ],
  ]);

  const payload = buildTwitterCollectorPayload(
    candidate,
    [repoSlugQuery, phraseQuery],
    postsByQuery,
    {
      agentName: "test-twitter-collector",
      agentVersion: "0.0.0",
      runId: "test-run",
      triggeredBy: "scheduled_refresh",
      windowHours: 24,
      postsPerRepo: 10,
      now: new Date("2026-04-22T12:00:00.000Z"),
    },
  );

  assert.equal(payload.version, "v1");
  assert.equal(payload.source, "twitter");
  assert.equal(payload.repo.githubFullName, "anthropic/claude-code");
  assert.equal(payload.rawSummary.acceptedPosts, 2);
  assert.equal(payload.posts[0]?.matchedBy, "url");
  assert.equal(payload.posts[0]?.confidence, "high");
  assert.equal(payload.posts[1]?.matchedBy, "phrase");
  assert.equal(payload.posts[1]?.confidence, "medium");
  assert.equal(payload.queries?.[0]?.matchCount, 1);
});

test("buildTwitterCollectorPayload keeps all matched posts when repo cap is zero", () => {
  const rawPosts = Array.from({ length: 125 }, (_, index) => {
    const id = `18912345679${String(index).padStart(3, "0")}`;
    return {
      postId: id,
      postUrl: `https://x.com/dev${index}/status/${id}`,
      authorHandle: `dev${index}`,
      postedAt: "2026-04-22T11:30:00.000Z",
      text: `https://github.com/anthropic/claude-code launch note ${index}`,
      likes: index === 42 ? 900 : index,
      reposts: index === 42 ? 120 : 0,
      replies: 0,
      quotes: 0,
    };
  });

  const payload = buildTwitterCollectorPayload(
    candidate,
    [repoSlugQuery],
    new Map([[repoSlugQuery.queryText, rawPosts]]),
    {
      agentName: "test-twitter-collector",
      agentVersion: "0.0.0",
      runId: "uncapped-run",
      triggeredBy: "scheduled_refresh",
      windowHours: 24,
      postsPerRepo: 0,
      now: new Date("2026-04-22T12:00:00.000Z"),
    },
  );

  assert.equal(payload.rawSummary.candidatePostsSeen, 125);
  assert.equal(payload.rawSummary.acceptedPosts, 125);
  assert.equal(payload.rawSummary.rejectedPosts, 0);
  assert.equal(payload.posts.length, 125);
  assert.equal(payload.posts[0]?.postId, "18912345679042");
});

test("buildTwitterCollectorPayload downgrades slug-query posts without visible slug", () => {
  const postsByQuery = new Map([
    [
      repoSlugQuery.queryText,
      [
        {
          postId: "1891234567803",
          postUrl: "https://x.com/devC/status/1891234567803",
          authorHandle: "devC",
          postedAt: "2026-04-22T11:30:00.000Z",
          text: "Claude Code keeps getting better for repo-aware edits.",
          likes: 8,
          reposts: 1,
          replies: 0,
          quotes: 0,
        },
      ],
    ],
  ]);

  const payload = buildTwitterCollectorPayload(candidate, [repoSlugQuery], postsByQuery, {
    agentName: "test-twitter-collector",
    agentVersion: "0.0.0",
    runId: "test-run",
    triggeredBy: "scheduled_refresh",
    windowHours: 24,
    postsPerRepo: 10,
    now: new Date("2026-04-22T12:00:00.000Z"),
  });

  assert.equal(payload.posts[0]?.matchedBy, "phrase");
  assert.equal(payload.posts[0]?.confidence, "medium");
  assert.match(payload.posts[0]?.whyMatched ?? "", /visible project phrase/);
});

test("buildTwitterCollectorPayload rejects tokenized exact-query noise", () => {
  const noisyCandidate: TwitterScanCandidate = {
    priorityRank: 1,
    priorityScore: 100,
    priorityReason: "test",
    lastScannedAt: null,
    repo: {
      repoId: "clash-verge-rev--clash-verge-rev",
      githubFullName: "clash-verge-rev/clash-verge-rev",
      githubUrl: "https://github.com/clash-verge-rev/clash-verge-rev",
      repoName: "clash-verge-rev",
      ownerName: "clash-verge-rev",
      homepageUrl: null,
      docsUrl: null,
      packageNames: [],
      aliases: ["clash-verge-rev"],
      description: "Proxy client",
    },
  };
  const query: TwitterQuery = {
    queryText: "clash-verge-rev/clash-verge-rev",
    queryType: "repo_slug",
    tier: 1,
    confidenceWeight: 1,
    enabled: true,
    rationale: "Exact GitHub repo slug",
  };
  const postsByQuery = new Map([
    [
      query.queryText,
      [
        {
          postId: "1891234567805",
          postUrl: "https://x.com/sports/status/1891234567805",
          authorHandle: "sports",
          postedAt: "2026-04-22T11:30:00.000Z",
          text: "Verge said rev share is going closer to 5% for the basketball team.",
          likes: 8,
          reposts: 1,
          replies: 0,
          quotes: 0,
        },
      ],
    ],
  ]);

  const payload = buildTwitterCollectorPayload(noisyCandidate, [query], postsByQuery, {
    agentName: "test-twitter-collector",
    agentVersion: "0.0.0",
    runId: "test-run",
    triggeredBy: "scheduled_refresh",
    windowHours: 24,
    postsPerRepo: 10,
    now: new Date("2026-04-22T12:00:00.000Z"),
  });

  assert.equal(payload.posts.length, 0);
  assert.equal(payload.rawSummary.candidatePostsSeen, 1);
  assert.equal(payload.rawSummary.rejectedPosts, 1);
});

test("buildTwitterCollectorPayload rejects generic project cues from exact-query fallback", () => {
  const genericCandidate: TwitterScanCandidate = {
    priorityRank: 1,
    priorityScore: 100,
    priorityReason: "test",
    lastScannedAt: null,
    repo: {
      repoId: "anthropics--skills",
      githubFullName: "anthropics/skills",
      githubUrl: "https://github.com/anthropics/skills",
      repoName: "skills",
      ownerName: "anthropics",
      homepageUrl: null,
      docsUrl: null,
      packageNames: [],
      aliases: ["skills"],
      description: "Skills repo",
    },
  };
  const query: TwitterQuery = {
    queryText: "anthropics/skills",
    queryType: "repo_slug",
    tier: 1,
    confidenceWeight: 1,
    enabled: true,
    rationale: "Exact GitHub repo slug",
  };
  const postsByQuery = new Map([
    [
      query.queryText,
      [
        {
          postId: "1891234567806",
          postUrl: "https://x.com/dev/status/1891234567806",
          authorHandle: "dev",
          postedAt: "2026-04-22T11:30:00.000Z",
          text: "Hiring for agents with skills in TypeScript and Python.",
          likes: 8,
          reposts: 1,
          replies: 0,
          quotes: 0,
        },
      ],
    ],
  ]);

  const payload = buildTwitterCollectorPayload(genericCandidate, [query], postsByQuery, {
    agentName: "test-twitter-collector",
    agentVersion: "0.0.0",
    runId: "test-run",
    triggeredBy: "scheduled_refresh",
    windowHours: 24,
    postsPerRepo: 10,
    now: new Date("2026-04-22T12:00:00.000Z"),
  });

  assert.equal(payload.posts.length, 0);
  assert.equal(payload.rawSummary.rejectedPosts, 1);
});

test("buildTwitterCollectorPayload rejects phrase matches without developer context", () => {
  const phraseOnlyQuery: TwitterQuery = {
    queryText: "\"Atuin\"",
    queryType: "project_name",
    tier: 2,
    confidenceWeight: 0.84,
    enabled: true,
    rationale: "Quoted project name",
  };
  const atuinCandidate: TwitterScanCandidate = {
    priorityRank: 1,
    priorityScore: 100,
    priorityReason: "test",
    lastScannedAt: null,
    repo: {
      repoId: "atuinsh--atuin",
      githubFullName: "atuinsh/atuin",
      githubUrl: "https://github.com/atuinsh/atuin",
      repoName: "atuin",
      ownerName: "atuinsh",
      homepageUrl: null,
      docsUrl: null,
      packageNames: [],
      aliases: ["atuin"],
      description: "Shell history sync",
    },
  };
  const postsByQuery = new Map([
    [
      phraseOnlyQuery.queryText,
      [
        {
          postId: "1891234567807",
          postUrl: "https://x.com/books/status/1891234567807",
          authorHandle: "books",
          postedAt: "2026-04-22T11:30:00.000Z",
          text: "The great Atuin is a good example.",
          likes: 8,
          reposts: 1,
          replies: 0,
          quotes: 0,
        },
        {
          postId: "1891234567808",
          postUrl: "https://x.com/dev/status/1891234567808",
          authorHandle: "dev",
          postedAt: "2026-04-22T11:29:00.000Z",
          text: "Atuin is a strong terminal tool for shell history sync.",
          likes: 8,
          reposts: 1,
          replies: 0,
          quotes: 0,
        },
      ],
    ],
  ]);

  const payload = buildTwitterCollectorPayload(atuinCandidate, [phraseOnlyQuery], postsByQuery, {
    agentName: "test-twitter-collector",
    agentVersion: "0.0.0",
    runId: "test-run",
    triggeredBy: "scheduled_refresh",
    windowHours: 24,
    postsPerRepo: 10,
    now: new Date("2026-04-22T12:00:00.000Z"),
  });

  assert.equal(payload.posts.length, 1);
  assert.equal(payload.posts[0]?.postId, "1891234567808");
  assert.deepEqual(payload.posts[0]?.supportingContext, [
    "project_name",
    "developer_context",
  ]);
});
