// X engagement — orchestrator.
//
// Pipeline: loadTargets + topic queries → search fresh candidate posts (reuse
// the toolbox provider) → filter (freshness + Redis ledger + daily budget) →
// compose an on-brand reply → in LIVE mode post it via the outbound adapter's
// in_reply_to_tweet_id path → record the ledger + audit row. In DRY mode the
// draft is written to the audit trail and NOTHING is posted. OFF is a hard
// kill: no search, no LLM, no Redis.
//
// Caps enforced every run: daily cap (default 8), 1 reply / author / 72h,
// per-post dedupe, and 1 reply / author / run. FAIL CLOSED on Redis/LLM: a
// missing budget or an un-composable reply skips rather than posting slop.

import "server-only";

import { selectOutboundAdapter } from "@/lib/twitter/outbound/adapters";
import type { OutboundAdapter } from "@/lib/twitter/outbound/types";

import { recordEngagementAttempt } from "./audit";
import { resolveEngagementMode } from "./gate";
import {
  freshnessConfigFromEnv,
  isFresh,
  type FreshnessConfig,
} from "./freshness";
import {
  engageDailyCap,
  redisEngagementLedger,
  type EngagementLedger,
} from "./ledger";
import { composeReply, type ReplyContext } from "./reply-composer";
import { loadTargets, loadTopicQueries } from "./targets";
import { searchEngagementCandidates } from "./x-search";
import type {
  EngagementCandidate,
  EngagementMode,
  EngagementRecord,
  EngagementResult,
  EngagementTarget,
} from "./types";

// Bounds — keep the per-run search fan-out and work modest.
const MAX_QUERIES = 12;
const PER_QUERY_LIMIT = 15;
const MAX_SCANNED = 80;

/** Injectable seams — production wiring is `defaultDeps()`; tests override. */
export interface EngagementDeps {
  loadTargets: () => EngagementTarget[];
  loadTopicQueries: () => string[];
  search: (
    query: string,
    opts: { limit?: number; sinceISO?: string; reason?: string },
  ) => Promise<EngagementCandidate[]>;
  compose: (
    post: EngagementCandidate,
    ctx: ReplyContext,
  ) => Promise<{ text: string } | null>;
  ledger: EngagementLedger;
  audit: (record: EngagementRecord) => Promise<void>;
  freshness: FreshnessConfig;
  /** Resolve the outbound adapter — called only in live mode, lazily. */
  resolveAdapter: () => OutboundAdapter;
  /** Optional grounding line offered to the reply composer. */
  dataPointFor: (post: EngagementCandidate) => string | undefined;
}

export interface RunEngagementOptions {
  now?: number;
  /** Downgrade live→dry (host `--dry-run`). Never upgrades; off stays off. */
  dryRun?: boolean;
  /** Explicit mode override (tests). Bypasses env resolution. */
  mode?: EngagementMode;
  /** Test seams — override any subset of deps. */
  deps?: Partial<EngagementDeps>;
}

function defaultDeps(): EngagementDeps {
  return {
    loadTargets: () => loadTargets(),
    loadTopicQueries: () => loadTopicQueries(),
    search: (query, opts) => searchEngagementCandidates(query, opts),
    compose: (post, ctx) => composeReply(post, ctx),
    ledger: redisEngagementLedger,
    audit: recordEngagementAttempt,
    freshness: freshnessConfigFromEnv(),
    resolveAdapter: () => selectOutboundAdapter(),
    dataPointFor: () => process.env.ENGAGE_DATA_POINT?.trim() || undefined,
  };
}

function mkRecord(
  nowMs: number,
  mode: "dry" | "live",
  status: EngagementRecord["status"],
  post: EngagementCandidate,
  reason: string,
  replyText: string | null,
  tweetId: string | null,
  replyUrl: string | null,
): EngagementRecord {
  return {
    ts: new Date(nowMs).toISOString(),
    date: new Date(nowMs).toISOString().slice(0, 10),
    mode,
    status,
    authorId: post.authorId,
    authorHandle: post.authorHandle,
    postId: post.id,
    postUrl: post.url,
    reason,
    replyText,
    tweetId,
    replyUrl,
  };
}

function emptyResult(mode: EngagementMode, reason: string): EngagementResult {
  return {
    ok: true,
    mode,
    reason,
    scanned: 0,
    eligible: 0,
    drafted: 0,
    posted: 0,
    skipped: 0,
    dailyBudgetRemaining: 0,
    records: [],
  };
}

/**
 * Run one engagement pass. Never throws — always returns a structured result.
 */
export async function runEngagement(
  options: RunEngagementOptions = {},
): Promise<EngagementResult> {
  const now = options.now ?? Date.now();

  // Gate. OFF is a hard kill — return before touching any dependency.
  const envMode = options.mode ?? resolveEngagementMode();
  if (envMode === "off") return emptyResult("off", "mode-off");
  // dryRun downgrades live→dry; it can never arm posting.
  const mode: "dry" | "live" = options.dryRun ? "dry" : envMode;

  const deps: EngagementDeps = { ...defaultDeps(), ...(options.deps ?? {}) };
  const records: EngagementRecord[] = [];

  const cap = engageDailyCap();
  let remaining = await deps.ledger.remainingDailyBudget(now, cap);
  if (remaining <= 0) {
    return {
      ...emptyResult(mode, "budget-exhausted"),
      dailyBudgetRemaining: 0,
    };
  }

  // Build the bounded query set: each curated target's recent originals, then
  // the topic searches.
  const queries: Array<{ query: string; reason: string }> = [];
  for (const t of deps.loadTargets()) {
    queries.push({
      query: `from:${t.handle} -filter:replies -filter:retweets`,
      reason: `target:@${t.handle}`,
    });
  }
  for (const q of deps.loadTopicQueries()) {
    queries.push({ query: q, reason: `topic:${q}` });
  }
  const bounded = queries.slice(0, MAX_QUERIES);

  const sinceISO = new Date(
    now - deps.freshness.maxAgeH * 60 * 60 * 1000,
  ).toISOString();

  // Gather + dedupe candidates by tweet id.
  const byId = new Map<string, EngagementCandidate>();
  for (const q of bounded) {
    const found = await deps.search(q.query, {
      limit: PER_QUERY_LIMIT,
      sinceISO,
      reason: q.reason,
    });
    for (const candidate of found) {
      if (!byId.has(candidate.id)) byId.set(candidate.id, candidate);
    }
    if (byId.size >= MAX_SCANNED) break;
  }
  const scanned = byId.size;

  // Freshness gate (pure).
  const fresh = [...byId.values()].filter((c) => isFresh(c, deps.freshness, now));
  const eligible = fresh.length;

  const seenAuthors = new Set<string>();
  let drafted = 0;
  let posted = 0;
  let skipped = 0;
  let adapter: OutboundAdapter | null = null;

  for (const post of fresh) {
    if (remaining <= 0) break;

    const authorKey = post.authorId.toLowerCase();
    if (seenAuthors.has(authorKey)) continue; // 1 reply / author / run

    // Durable dedupe + author cooldown (fail-closed inside the ledger).
    if (!(await deps.ledger.canEngagePost(post.id))) continue;
    if (!(await deps.ledger.canEngageAuthor(post.authorId))) continue;

    const draft = await deps.compose(post, {
      dataPoint: deps.dataPointFor(post),
      dryRun: mode === "dry",
    });
    if (!draft) {
      skipped += 1;
      const rec = mkRecord(now, mode, "skipped", post, "no-onbrand-reply", null, null, null);
      records.push(rec);
      await deps.audit(rec);
      continue;
    }

    if (mode === "dry") {
      seenAuthors.add(authorKey);
      drafted += 1;
      remaining -= 1;
      const rec = mkRecord(now, mode, "drafted", post, post.matchedReason, draft.text, null, null);
      records.push(rec);
      await deps.audit(rec);
      continue;
    }

    // ---- live ----
    if (!adapter) adapter = deps.resolveAdapter();
    if (!adapter.publishes) {
      // No real transport configured — record once and stop (all would skip).
      skipped += 1;
      const rec = mkRecord(now, mode, "skipped", post, "no-publish-transport", draft.text, null, null);
      records.push(rec);
      await deps.audit(rec);
      break;
    }

    try {
      const result = await adapter.postThread([
        { kind: "engagement_reply", text: draft.text, inReplyToId: post.id },
      ]);
      const first = result.posts[0];
      const tweetId = first?.remoteId ?? null;
      const replyUrl = first?.url ?? result.threadUrl ?? null;

      const recorded = await deps.ledger.recordEngagement({
        authorId: post.authorId,
        postId: post.id,
        nowMs: now,
      });
      if (!recorded) {
        console.warn(
          `[x-engagement] posted reply to ${post.id} but ledger record failed — possible cap drift`,
        );
      }

      seenAuthors.add(authorKey);
      posted += 1;
      remaining -= 1;
      const rec = mkRecord(now, mode, "posted", post, post.matchedReason, draft.text, tweetId, replyUrl);
      records.push(rec);
      await deps.audit(rec);
    } catch (err) {
      const rec = mkRecord(
        now,
        mode,
        "error",
        post,
        `post-failed: ${err instanceof Error ? err.message : String(err)}`,
        draft.text,
        null,
        null,
      );
      records.push(rec);
      await deps.audit(rec);
      // A transport error likely affects every post — stop this run.
      break;
    }
  }

  return {
    ok: true,
    mode,
    scanned,
    eligible,
    drafted,
    posted,
    skipped,
    dailyBudgetRemaining: Math.max(0, remaining),
    records,
  };
}
