// Server-side brain of the 3x/day X autopilot. The box-host runner
// (scripts/twitter-trending-run.mjs) can't import app code — the `twitter` CLI
// lives on the host, not in the container — so it talks to this over HTTP:
//
//   1. POST /api/cron/twitter-trending           -> proposeTrendingPost()
//        ranks the (spam-filtered) repos exactly like the site's TOP board,
//        checks the durable Redis ledger for cooldown + daily cap, and returns
//        the fully-composed next tweet (or {post:false, reason}).
//   2. host posts it via `twitter post --json`.
//   3. POST … { confirm:{ fullName, tweetId, text } } -> confirmTrendingPost()
//        commits the ledger (Redis, survives container restarts) + audit row.
//
// The cap + 14-day cooldown make a double-fired cron slot a no-op.

import "server-only";

import { getDataStore } from "@/lib/data-store";
import { getDerivedRepos } from "@/lib/derived-repos";
import { computeTopComposite } from "@/lib/scoring/top-composite";
import type { Repo } from "@/lib/types";

import { composeTrendingSingle } from "./composer";
import { selectTrendingPost } from "./trending-picker";
import { recordOutboundRun } from "./audit";

export const TRENDING_LEDGER_SLUG = "twitter-trending-ledger";
const COOLDOWN_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const LEDGER_MAX = 500;

export interface TrendingLedgerPost {
  date: string; // YYYY-MM-DD (UTC) — for the daily cap
  ts: string; // ISO — for the cooldown window
  fullName: string;
  tweetId: string;
  text: string;
}
export interface TrendingLedger {
  posts: TrendingLedgerPost[];
}

export interface TrendingProposal {
  post: boolean;
  reason?: string;
  repoId?: string;
  fullName?: string;
  text?: string;
  url?: string;
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/** UTC YYYY-MM-DD for a timestamp. */
export function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Cooldown set (repos posted within COOLDOWN_DAYS) + today's post count. */
export function computeLedgerState(
  ledger: TrendingLedger,
  nowMs: number,
): { cooldownFullNames: Set<string>; postedTodayCount: number } {
  const cutoff = nowMs - COOLDOWN_DAYS * DAY_MS;
  const today = utcDate(nowMs);
  const cooldownFullNames = new Set<string>();
  let postedTodayCount = 0;
  for (const p of ledger.posts ?? []) {
    const t = Date.parse(p.ts);
    if (Number.isFinite(t) && t >= cutoff) cooldownFullNames.add(p.fullName);
    if (p.date === today) postedTodayCount += 1;
  }
  return { cooldownFullNames, postedTodayCount };
}

/** Append a post, bounding the ledger to the most recent LEDGER_MAX. Pure. */
export function appendLedgerPost(
  ledger: TrendingLedger,
  post: TrendingLedgerPost,
): TrendingLedger {
  return { posts: [...(ledger.posts ?? []), post].slice(-LEDGER_MAX) };
}

/**
 * Rank the spam-filtered repos for the poster: TOP-composite order over repos
 * with real 24h movement. Mirrors the site's TOP board so we tweet what the
 * fixed ranking says is hottest.
 */
export function rankTrendingCandidates(repos: Repo[]): Repo[] {
  const movers = repos.filter((r) => (r.starsDelta24h ?? 0) > 0);
  const pool = movers.length > 0 ? movers : repos;
  const scores = computeTopComposite(pool, "24h");
  return [...pool].sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0));
}

function maxPerDay(): number {
  const n = Number.parseInt(process.env.TRENDING_POST_MAX_PER_DAY ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

async function readLedger(): Promise<TrendingLedger> {
  try {
    const res = await getDataStore().read<TrendingLedger>(TRENDING_LEDGER_SLUG);
    return res.data && Array.isArray(res.data.posts) ? res.data : { posts: [] };
  } catch {
    return { posts: [] };
  }
}

/** Decide + compose the next tweet without committing anything. */
export async function proposeTrendingPost(nowMs: number = Date.now()): Promise<TrendingProposal> {
  const ranked = rankTrendingCandidates(getDerivedRepos());
  if (ranked.length === 0) return { post: false, reason: "no-candidates" };

  const cap = maxPerDay();
  const state = computeLedgerState(await readLedger(), nowMs);
  if (state.postedTodayCount >= cap) {
    return { post: false, reason: `daily-cap-reached (${state.postedTodayCount}/${cap})` };
  }

  const repo = selectTrendingPost(ranked, state, cap);
  if (!repo) return { post: false, reason: "all-top-repos-in-cooldown" };

  const composed = composeTrendingSingle(repo);
  return {
    post: true,
    repoId: repo.id,
    fullName: repo.fullName,
    text: composed.text,
    url: composed.url ?? undefined,
  };
}

/** Commit a confirmed post to the durable ledger + audit trail. */
export async function confirmTrendingPost(
  fullName: string,
  tweetId: string,
  text: string,
  nowMs: number = Date.now(),
): Promise<void> {
  const next = appendLedgerPost(await readLedger(), {
    date: utcDate(nowMs),
    ts: new Date(nowMs).toISOString(),
    fullName,
    tweetId,
    text,
  });
  await getDataStore().write(TRENDING_LEDGER_SLUG, next);
  await recordOutboundRun({
    kind: "trending_single",
    adapterName: "twitter_cli_host",
    status: "published",
    threadUrl: `https://x.com/i/status/${tweetId}`,
    postCount: 1,
    startedAt: new Date(nowMs).toISOString(),
  }).catch(() => undefined);
}
