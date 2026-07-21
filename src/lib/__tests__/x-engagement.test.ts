// Tests for the X engagement engine:
//   - freshness.ts    (pure predicate: age / retweet / reply / own / min-likes)
//   - ledger.ts       (Redis anti-spam: author cooldown, post dedupe, daily cap,
//                       FAIL CLOSED when the client is null)
//   - reply-composer  (validator + composeReply dry path with an injected chat)
//   - runner.ts       (dry never posts; live posts via the in_reply_to path; off
//                       is a hard kill; budget exhaustion)
//
// node:test + injected fakes only — no real Redis, LLM, or network.

import { test } from "node:test";
import assert from "node:assert/strict";

import type { RedisClientLike } from "../data-store";
import type {
  AdapterThreadResult,
  ComposedPost,
  OutboundAdapter,
} from "../twitter/outbound/types";

import {
  DEFAULT_MAX_AGE_H,
  freshnessConfigFromEnv,
  isFresh,
  type FreshnessConfig,
} from "../twitter/engagement/freshness";
import {
  createEngagementLedger,
  engageDailyCap,
  DEFAULT_DAILY_CAP,
} from "../twitter/engagement/ledger";
import {
  composeReply,
  validateReply,
} from "../twitter/engagement/reply-composer";
import { resolveEngagementMode } from "../twitter/engagement/gate";
import {
  CURATED_TARGETS,
  isExcludedHandle,
  loadTargets,
  loadTopicQueries,
} from "../twitter/engagement/targets";
import { classifyCandidate } from "../twitter/engagement/classifier";
import { runEngagement, type EngagementDeps } from "../twitter/engagement/runner";
import type {
  EngagementCandidate,
  EngagementRecord,
  EngagementTarget,
} from "../twitter/engagement/types";

const NOW = Date.parse("2026-07-21T12:00:00.000Z");
const FRESH_CONFIG: FreshnessConfig = {
  maxAgeH: 6,
  minLikes: 0,
  ownHandle: "trendingrepo",
};

function makeCandidate(
  p: Partial<EngagementCandidate> & { id: string },
): EngagementCandidate {
  return {
    id: p.id,
    url: p.url ?? `https://x.com/${p.authorHandle ?? "dev"}/status/${p.id}`,
    authorId: p.authorId ?? p.authorHandle ?? "dev",
    authorHandle: p.authorHandle ?? "dev",
    text: p.text ?? "shipped an open-source LLM agent framework today",
    createdAt: p.createdAt ?? new Date(NOW - 60 * 60 * 1000).toISOString(),
    isReply: p.isReply ?? false,
    isRetweet: p.isRetweet ?? false,
    likeCount: p.likeCount ?? 0,
    matchedReason: p.matchedReason ?? "topic:test",
  };
}

function makeFakeRedis(seed: Record<string, string> = {}): {
  client: RedisClientLike;
  store: Map<string, string>;
} {
  const store = new Map<string, string>(Object.entries(seed));
  const client: RedisClientLike = {
    get: async (k) => (store.has(k) ? store.get(k)! : null),
    set: async (k, v) => {
      store.set(k, String(v));
      return "OK";
    },
    del: async (...ks) => {
      let n = 0;
      for (const k of ks) if (store.delete(k)) n += 1;
      return n;
    },
  };
  return { client, store };
}

// ---------------------------------------------------------------------------
// freshness
// ---------------------------------------------------------------------------

test("isFresh accepts a recent original post from another author", () => {
  assert.equal(isFresh(makeCandidate({ id: "1" }), FRESH_CONFIG, NOW), true);
});

test("isFresh rejects retweets and replies", () => {
  assert.equal(isFresh(makeCandidate({ id: "2", isRetweet: true }), FRESH_CONFIG, NOW), false);
  assert.equal(isFresh(makeCandidate({ id: "3", isReply: true }), FRESH_CONFIG, NOW), false);
});

test("isFresh rejects our own posts (case-insensitive handle)", () => {
  const own = makeCandidate({ id: "4", authorHandle: "TrendingRepo" });
  assert.equal(isFresh(own, FRESH_CONFIG, NOW), false);
});

test("isFresh rejects posts older than the window and future-dated posts", () => {
  const old = makeCandidate({ id: "5", createdAt: new Date(NOW - 7 * 60 * 60 * 1000).toISOString() });
  assert.equal(isFresh(old, FRESH_CONFIG, NOW), false);
  const future = makeCandidate({ id: "6", createdAt: new Date(NOW + 60 * 1000).toISOString() });
  assert.equal(isFresh(future, FRESH_CONFIG, NOW), false);
});

test("isFresh enforces the min-likes floor only when set", () => {
  const cfg: FreshnessConfig = { ...FRESH_CONFIG, minLikes: 5 };
  assert.equal(isFresh(makeCandidate({ id: "7", likeCount: 2 }), cfg, NOW), false);
  assert.equal(isFresh(makeCandidate({ id: "8", likeCount: 9 }), cfg, NOW), true);
  // Default floor of 0 accepts a zero-like post.
  assert.equal(isFresh(makeCandidate({ id: "9", likeCount: 0 }), FRESH_CONFIG, NOW), true);
});

test("freshnessConfigFromEnv reads overrides and falls back to defaults", () => {
  assert.equal(freshnessConfigFromEnv({}).maxAgeH, DEFAULT_MAX_AGE_H);
  const cfg = freshnessConfigFromEnv({
    ENGAGE_MAX_AGE_H: "3",
    ENGAGE_MIN_LIKES: "10",
    TWITTER_USERNAME: "@TrendingRepo",
  });
  assert.equal(cfg.maxAgeH, 3);
  assert.equal(cfg.minLikes, 10);
  assert.equal(cfg.ownHandle, "trendingrepo");
});

// ---------------------------------------------------------------------------
// ledger
// ---------------------------------------------------------------------------

test("ledger blocks an author for the cooldown after recording", async () => {
  const { client } = makeFakeRedis();
  const ledger = createEngagementLedger(() => client);
  assert.equal(await ledger.canEngageAuthor("alice"), true);
  await ledger.recordEngagement({ authorId: "alice", postId: "p1", nowMs: NOW });
  assert.equal(await ledger.canEngageAuthor("alice"), false);
});

test("ledger dedupes a post after it has been replied to", async () => {
  const { client } = makeFakeRedis();
  const ledger = createEngagementLedger(() => client);
  assert.equal(await ledger.canEngagePost("p1"), true);
  await ledger.recordEngagement({ authorId: "bob", postId: "p1", nowMs: NOW });
  assert.equal(await ledger.canEngagePost("p1"), false);
});

test("ledger decrements the daily budget as replies are recorded", async () => {
  const { client } = makeFakeRedis();
  const ledger = createEngagementLedger(() => client);
  assert.equal(await ledger.remainingDailyBudget(NOW, 8), 8);
  await ledger.recordEngagement({ authorId: "a", postId: "1", nowMs: NOW });
  await ledger.recordEngagement({ authorId: "b", postId: "2", nowMs: NOW });
  assert.equal(await ledger.remainingDailyBudget(NOW, 8), 6);
});

test("ledger writes the documented key namespaces", async () => {
  const { client, store } = makeFakeRedis();
  const ledger = createEngagementLedger(() => client);
  await ledger.recordEngagement({ authorId: "alice", postId: "p9", nowMs: NOW });
  assert.equal(store.get("ss:x:engaged:author:alice"), "1");
  assert.equal(store.get("ss:x:engaged:post:p9"), "1");
  assert.equal(store.get("ss:x:engage:count:2026-07-21"), "1");
});

test("ledger FAILS CLOSED when Redis is unavailable", async () => {
  const ledger = createEngagementLedger(() => null);
  assert.equal(await ledger.canEngageAuthor("a"), false);
  assert.equal(await ledger.canEngagePost("p"), false);
  assert.equal(await ledger.remainingDailyBudget(NOW, 8), 0);
  assert.equal(await ledger.recordEngagement({ authorId: "a", postId: "p", nowMs: NOW }), false);
});

test("engageDailyCap honours ENGAGE_DAILY_CAP with a sane default", () => {
  assert.equal(engageDailyCap({}), DEFAULT_DAILY_CAP);
  assert.equal(engageDailyCap({ ENGAGE_DAILY_CAP: "3" }), 3);
  assert.equal(engageDailyCap({ ENGAGE_DAILY_CAP: "0" }), DEFAULT_DAILY_CAP);
});

// ---------------------------------------------------------------------------
// reply validator + composeReply
// ---------------------------------------------------------------------------

test("validateReply accepts an on-brand reply and rejects slop", () => {
  assert.equal(validateReply("Neat — this maps to the retrieval pattern in llama_index; the eval harness is the hard part."), null);
  assert.equal(validateReply("SKIP"), "model-skipped");
  assert.equal(validateReply(""), "empty");
  assert.equal(validateReply("Great point, love this!"), "sycophantic");
  assert.equal(validateReply("x".repeat(241)), "over-budget (241>240)");
  assert.equal(validateReply("🚀 first out the gate"), "emoji-open");
  assert.equal(validateReply("cool 🚀🔥🎉"), "too-many-emoji (3)");
  assert.equal(validateReply("no hashtags #ai allowed"), "hashtags (1)");
  assert.equal(validateReply("hey @someone check this"), "mention");
  assert.equal(validateReply("this is huge for local inference"), "sycophantic");
});

test("composeReply returns a draft from the model and null on SKIP", async () => {
  const good = await composeReply(makeCandidate({ id: "c1" }), {
    chat: async () => "Solid — the tricky bit is eval, not retrieval. Worth benchmarking recall@k.",
  });
  assert.ok(good);
  assert.match(good.text, /eval/);

  const skip = await composeReply(makeCandidate({ id: "c2" }), {
    chat: async () => "SKIP",
  });
  assert.equal(skip, null);

  const empty = await composeReply(makeCandidate({ id: "c3" }), {
    chat: async () => null,
  });
  assert.equal(empty, null);

  const slop = await composeReply(makeCandidate({ id: "c4" }), {
    chat: async () => "Amazing!!! love this so much",
  });
  assert.equal(slop, null);
});

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------

/** A spy adapter that records postThread calls. */
function makeSpyAdapter(publishes: boolean): {
  adapter: OutboundAdapter;
  calls: ComposedPost[][];
} {
  const calls: ComposedPost[][] = [];
  const adapter: OutboundAdapter = {
    name: "spy",
    publishes,
    async postThread(thread: ComposedPost[]): Promise<AdapterThreadResult> {
      calls.push(thread);
      return {
        posts: thread.map(() => ({
          remoteId: "999",
          url: "https://x.com/trendingrepo/status/999",
          status: "published" as const,
        })),
        threadUrl: "https://x.com/trendingrepo/status/999",
      };
    },
  };
  return { adapter, calls };
}

function makeDeps(
  overrides: Partial<EngagementDeps>,
  audit: EngagementRecord[],
): Partial<EngagementDeps> {
  const { client } = makeFakeRedis();
  return {
    loadTargets: (): EngagementTarget[] => [
      {
        handle: "dev",
        tier: "builder",
        followerCount: 0,
        topicTags: ["ai"],
        replyAngle: "concrete",
        cautionFlags: [],
      },
    ],
    loadTopicQueries: () => [],
    search: async () => [makeCandidate({ id: "t1", authorHandle: "dev" })],
    ledger: createEngagementLedger(() => client),
    audit: async (r) => {
      audit.push(r);
    },
    freshness: FRESH_CONFIG,
    dataPointFor: () => undefined,
    ...overrides,
  };
}

test("runEngagement DRY mode returns a draft and NEVER calls the post adapter", async () => {
  const audit: EngagementRecord[] = [];
  const { adapter, calls } = makeSpyAdapter(true);
  const result = await runEngagement({
    mode: "dry",
    now: NOW,
    deps: makeDeps(
      {
        compose: async () => ({ text: "Retrieval is easy; the eval harness is the moat." }),
        // If the dry path ever resolved an adapter this spy would surface it.
        resolveAdapter: () => adapter,
      },
      audit,
    ),
  });

  assert.equal(result.mode, "dry");
  assert.equal(result.drafted, 1);
  assert.equal(result.posted, 0);
  assert.equal(calls.length, 0, "dry mode must not post");
  assert.equal(audit.length, 1);
  assert.equal(audit[0]!.status, "drafted");
  assert.match(audit[0]!.replyText ?? "", /eval harness/);
});

test("runEngagement LIVE mode posts via the in_reply_to path and records the ledger", async () => {
  const audit: EngagementRecord[] = [];
  const { client } = makeFakeRedis();
  const ledger = createEngagementLedger(() => client);
  const { adapter, calls } = makeSpyAdapter(true);
  const result = await runEngagement({
    mode: "live",
    now: NOW,
    deps: makeDeps(
      {
        ledger,
        compose: async () => ({ text: "Benchmark recall@k before shipping — retrieval quality dominates." }),
        resolveAdapter: () => adapter,
      },
      audit,
    ),
  });

  assert.equal(result.posted, 1);
  assert.equal(calls.length, 1);
  const thread = calls[0]!;
  assert.equal(thread[0]!.kind, "engagement_reply");
  assert.equal(thread[0]!.inReplyToId, "t1", "reply must target the candidate tweet id");
  // Ledger recorded → author now blocked.
  assert.equal(await ledger.canEngageAuthor("dev"), false);
  assert.equal(audit[0]!.status, "posted");
  assert.equal(audit[0]!.tweetId, "999");
});

test("runEngagement OFF mode is a hard kill — no search, no adapter", async () => {
  const audit: EngagementRecord[] = [];
  let searched = 0;
  const { adapter, calls } = makeSpyAdapter(true);
  const result = await runEngagement({
    mode: "off",
    now: NOW,
    deps: makeDeps(
      {
        search: async () => {
          searched += 1;
          return [makeCandidate({ id: "t1" })];
        },
        compose: async () => ({ text: "should never run" }),
        resolveAdapter: () => adapter,
      },
      audit,
    ),
  });

  assert.equal(result.mode, "off");
  assert.equal(result.reason, "mode-off");
  assert.equal(searched, 0);
  assert.equal(calls.length, 0);
  assert.equal(audit.length, 0);
});

test("runEngagement dryRun downgrades live→dry (never posts)", async () => {
  const audit: EngagementRecord[] = [];
  const { adapter, calls } = makeSpyAdapter(true);
  const result = await runEngagement({
    mode: "live",
    dryRun: true,
    now: NOW,
    deps: makeDeps(
      {
        compose: async () => ({ text: "A concrete, useful point about the eval harness." }),
        resolveAdapter: () => adapter,
      },
      audit,
    ),
  });
  assert.equal(result.mode, "dry");
  assert.equal(result.posted, 0);
  assert.equal(result.drafted, 1);
  assert.equal(calls.length, 0);
});

test("runEngagement stops when the daily budget is exhausted", async () => {
  const audit: EngagementRecord[] = [];
  const { client } = makeFakeRedis({ "ss:x:engage:count:2026-07-21": "8" });
  const result = await runEngagement({
    mode: "live",
    now: NOW,
    deps: makeDeps({ ledger: createEngagementLedger(() => client) }, audit),
  });
  assert.equal(result.reason, "budget-exhausted");
  assert.equal(result.posted, 0);
  assert.equal(result.dailyBudgetRemaining, 0);
});

test("runEngagement live skips cleanly when no publishing transport is configured", async () => {
  const audit: EngagementRecord[] = [];
  const { adapter, calls } = makeSpyAdapter(false); // publishes: false (Null adapter)
  const result = await runEngagement({
    mode: "live",
    now: NOW,
    deps: makeDeps(
      {
        compose: async () => ({ text: "A useful data-driven point." }),
        resolveAdapter: () => adapter,
      },
      audit,
    ),
  });
  assert.equal(result.posted, 0);
  assert.equal(result.skipped, 1);
  assert.equal(calls.length, 0);
  assert.equal(audit[0]!.status, "skipped");
  assert.equal(audit[0]!.reason, "no-publish-transport");
});

// ---------------------------------------------------------------------------
// classifier (on-topic gate)
// ---------------------------------------------------------------------------

test("classifier skips crypto/politics on ANY account (brand safety)", () => {
  assert.equal(classifyCandidate({ text: "new bitcoin airdrop is live" }).engage, false);
  assert.equal(classifyCandidate({ text: "the election results are in" }).engage, false);
  // A genuine AI/dev post from the same firehose still engages.
  assert.equal(
    classifyCandidate(
      { text: "new open-source coding agent just dropped on github" },
      { cautionFlags: ["crypto-politics-firehose"] },
    ).engage,
    true,
  );
});

test("classifier honours per-account caution flags", () => {
  // @theo — no hot-takes.
  assert.equal(
    classifyCandidate({ text: "hot take: AI coding tools make junior devs worse" }, { cautionFlags: ["no-hot-takes"] }).engage,
    false,
  );
  // Same hot-take from an account WITHOUT the flag is not gated here (composer decides).
  assert.equal(
    classifyCandidate({ text: "hot take: AI coding tools make junior devs worse" }, { cautionFlags: [] }).engage,
    true,
  );
  // @heyBarsee — skip pure hype.
  assert.equal(
    classifyCandidate({ text: "this is INSANE, will change everything" }, { cautionFlags: ["skip-hype"] }).engage,
    false,
  );
});

test("runEngagement skips a crypto/politics post from a target via the classifier gate", async () => {
  const audit: EngagementRecord[] = [];
  let composed = 0;
  const result = await runEngagement({
    mode: "live",
    now: NOW,
    deps: makeDeps(
      {
        loadTargets: (): EngagementTarget[] => [
          { handle: "RoundtableSpace", tier: "operator", followerCount: 257000, topicTags: ["ai"], replyAngle: "AI only", cautionFlags: ["crypto-politics-firehose"] },
        ],
        search: async () => [
          makeCandidate({ id: "x1", authorHandle: "RoundtableSpace", authorId: "roundtablespace", text: "huge bitcoin airdrop today" }),
        ],
        compose: async () => {
          composed += 1;
          return { text: "should never compose" };
        },
      },
      audit,
    ),
  });
  assert.equal(composed, 0, "classifier must gate before compose");
  assert.equal(result.posted, 0);
  assert.equal(result.drafted, 0);
});

test("runEngagement hard-excludes our own sibling handle", async () => {
  const audit: EngagementRecord[] = [];
  let composed = 0;
  const result = await runEngagement({
    mode: "dry",
    now: NOW,
    deps: makeDeps(
      {
        search: async () => [
          makeCandidate({ id: "self1", authorHandle: "trending_repos", authorId: "trending_repos", text: "we ship AI tools" }),
        ],
        compose: async () => {
          composed += 1;
          return { text: "nope" };
        },
      },
      audit,
    ),
  });
  assert.equal(composed, 0);
  assert.equal(result.drafted, 0);
});

// ---------------------------------------------------------------------------
// gate + targets
// ---------------------------------------------------------------------------

test("resolveEngagementMode defaults to off and only arms on explicit values", () => {
  assert.equal(resolveEngagementMode({}), "off");
  assert.equal(resolveEngagementMode({ TWITTER_ENGAGEMENT_MODE: "bogus" }), "off");
  assert.equal(resolveEngagementMode({ TWITTER_ENGAGEMENT_MODE: "DRY" }), "dry");
  assert.equal(resolveEngagementMode({ TWITTER_ENGAGEMENT_MODE: "live" }), "live");
});

test("loadTargets falls back to the curated roster and honours the JSON override", () => {
  assert.equal(loadTargets({}).length, CURATED_TARGETS.length);
  assert.equal(CURATED_TARGETS.length, 21);
  const custom = loadTargets({
    ENGAGE_TARGETS_JSON: JSON.stringify([
      { handle: "@someLab", tier: "builder", followerCount: 1000, topicTags: ["llm"], replyAngle: "x", cautionFlags: [] },
    ]),
  });
  assert.equal(custom.length, 1);
  assert.equal(custom[0]!.handle, "someLab");
  assert.equal(custom[0]!.tier, "builder");
});

test("targets self-filter: our own handles are never loadable and isExcludedHandle catches both", () => {
  assert.equal(isExcludedHandle("@TrendingRepo"), true);
  assert.equal(isExcludedHandle("trending_repos"), true);
  assert.equal(isExcludedHandle("simonw"), false);
  // Even if an operator lists a self-handle in the override, it is dropped.
  const withSelf = loadTargets({
    ENGAGE_TARGETS_JSON: JSON.stringify([
      { handle: "trendingrepo", tier: "tool", followerCount: 1, topicTags: [], replyAngle: "", cautionFlags: [] },
      { handle: "realLab", tier: "builder", followerCount: 1, topicTags: [], replyAngle: "", cautionFlags: [] },
    ]),
  });
  assert.equal(withSelf.length, 1);
  assert.equal(withSelf[0]!.handle, "realLab");
});

test("loadTopicQueries returns defaults and honours the JSON override", () => {
  assert.ok(loadTopicQueries({}).length > 0);
  const custom = loadTopicQueries({ ENGAGE_TOPIC_QUERIES: JSON.stringify(["only this"]) });
  assert.deepEqual(custom, ["only this"]);
});
