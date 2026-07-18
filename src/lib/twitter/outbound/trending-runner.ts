// Server-side brain of the 5x/day X autopilot. The box-host runner
// (scripts/twitter-trending-run.mjs) can't import app code — the `twitter` CLI
// lives on the host, not in the container — so it talks to this over HTTP:
//
//   1. POST /api/cron/twitter-trending { slot?: "A"|"B"|"C"|"D"|"E" }
//        -> proposeTrendingPost(): resolves the content-calendar format for
//           the slot (single with criteria copy / discovery single / themed
//           pack), checks the durable Redis ledger for cooldown + daily cap,
//           and returns the fully-composed next tweet — including the
//           app-relative OG image to attach — or {post:false, reason}.
//   2. host downloads mediaPath + posts via `twitter post -i card.png --json`.
//   3. POST … { confirm:{ fullNames, tweetId, text, format, packId } }
//        -> confirmTrendingPost() commits one ledger row PER REPO (so every
//           pack member starts its cooldown) + one audit row.
//
// The cap counts distinct tweet ids per UTC day, so a 5-repo pack burns one
// slot, and cap + 14-day cooldown make a double-fired cron a no-op.

import "server-only";

import { getDataStore } from "@/lib/data-store";
import { getDerivedRepos } from "@/lib/derived-repos";
import { DataStoreFatalError } from "@/lib/errors";
import { computeTopComposite } from "@/lib/scoring/top-composite";
import { computeDiscoveryScore, pickTopDiscoveryRepo } from "@/lib/scoring/discovery";
import { isSpamRepo } from "@/lib/ranking/repo-quality";
import { sustainedTrendScore } from "@/lib/ranking/trend-score";
import { polishTweet } from "@/lib/llm/copywriter";
import { refreshTrendingFromStore } from "@/lib/trending";
import { refreshRecentReposFromStore } from "@/lib/recent-repos";
import { refreshRepoMetadataFromStore } from "@/lib/repo-metadata";
import { refreshRepoRegistryFromStore } from "@/lib/derived-repos/loaders/registry";
import { refreshStarActivityDeltasFromStore } from "@/lib/star-activity-deltas";
import { refreshTwitterSignalsFromStore } from "@/lib/twitter";
import { refreshAllMentionStores } from "@/lib/refresh-mentions";
import type { Repo } from "@/lib/types";

import { composeTrendingPack, composeTrendingSingle } from "./composer";
import {
  resolveSlotFormat,
  type SlotFormatKind,
  type SlotId,
  type TrendingRanker,
} from "./content-calendar";
import { getPack, selectPackRepos } from "./packs";
import { selectTrendingPost } from "./trending-picker";
import { recordOutboundRun } from "./audit";

export const TRENDING_LEDGER_SLUG = "twitter-trending-ledger";
/** Copy audit trail (CE-5): every confirmed post's final text + source. */
export const X_CONTENT_LEDGER_SLUG = "x-content-ledger";
const CONTENT_LEDGER_MAX = 300;
const COOLDOWN_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const LEDGER_MAX = 500;

export interface TrendingLedgerPost {
  date: string; // YYYY-MM-DD (UTC) — for the daily cap
  ts: string; // ISO — for the cooldown window
  fullName: string;
  tweetId: string;
  text: string;
  /** v2 — absent on legacy rows (implied "trending_single"). */
  format?: string;
  /** v2 — set when format === "trending_pack". */
  packId?: string;
  ranker?: TrendingRanker;
}
export interface TrendingLedger {
  posts: TrendingLedgerPost[];
}

export interface TrendingProposal {
  post: boolean;
  reason?: string;
  /** Resolved content format for this slot (v2; absent pre-calendar). */
  format?: SlotFormatKind;
  packId?: string;
  ranker?: TrendingRanker;
  repoId?: string;
  /** Single-format repo (kept for runner v1 compatibility). */
  fullName?: string;
  /** All repos in the post — [fullName] for singles, members for packs. */
  fullNames?: string[];
  text?: string;
  url?: string;
  /** App-relative OG card to attach (`twitter post -i`); optional. */
  mediaPath?: string;
  /** Who wrote the final copy — "llm" (validated) or "deterministic". */
  source?: "llm" | "deterministic";
}

export interface TrendingConfirm {
  fullNames: string[];
  tweetId: string;
  text: string;
  format?: SlotFormatKind;
  packId?: string;
  ranker?: TrendingRanker;
  source?: string;
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/** UTC YYYY-MM-DD for a timestamp. */
export function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Cooldown set (repos posted within COOLDOWN_DAYS) + today's post count.
 * The count is DISTINCT TWEETS today, not ledger rows — a 5-repo pack writes
 * five rows (each member cools down) but consumes one daily-cap slot.
 */
export function computeLedgerState(
  ledger: TrendingLedger,
  nowMs: number,
): { cooldownFullNames: Set<string>; postedTodayCount: number } {
  const cutoff = nowMs - COOLDOWN_DAYS * DAY_MS;
  const today = utcDate(nowMs);
  const cooldownFullNames = new Set<string>();
  const todayTweetIds = new Set<string>();
  for (const p of ledger.posts ?? []) {
    const t = Date.parse(p.ts);
    if (Number.isFinite(t) && t >= cutoff) cooldownFullNames.add(p.fullName.toLowerCase());
    if (p.date === today) todayTweetIds.add(p.tweetId);
  }
  return { cooldownFullNames, postedTodayCount: todayTweetIds.size };
}

/** Append a post, bounding the ledger to the most recent LEDGER_MAX. Pure. */
export function appendLedgerPost(
  ledger: TrendingLedger,
  post: TrendingLedgerPost,
): TrendingLedger {
  const duplicate = (ledger.posts ?? []).some(
    (p) => p.tweetId === post.tweetId && p.fullName.toLowerCase() === post.fullName.toLowerCase(),
  );
  if (duplicate) return ledger;
  return { posts: [...(ledger.posts ?? []), post].slice(-LEDGER_MAX) };
}

/**
 * Rank the spam-filtered repos for the poster: TOP-composite order over repos
 * with real 24h movement. Mirrors the site's TOP board so we tweet what the
 * fixed ranking says is hottest.
 */
export function rankTrendingCandidates(
  repos: Repo[],
  ranker: TrendingRanker = "top",
): Repo[] {
  if (ranker === "gainer") {
    return repos.filter((r) => (r.starsDelta24h ?? 0) > 0).sort(
      (a, b) =>
        (b.starsDelta24h ?? 0) - (a.starsDelta24h ?? 0) ||
        (b.starsDelta7d ?? 0) - (a.starsDelta7d ?? 0),
    );
  }
  if (ranker === "trend") {
    const ranked = [...repos].sort(
      (a, b) => sustainedTrendScore(b) - sustainedTrendScore(a),
    );
    return ranked[0] && sustainedTrendScore(ranked[0]) > 0
      ? ranked
      : rankTrendingCandidates(repos, "top");
  }
  if (ranker === "discovery") {
    const scores = computeDiscoveryScore(repos);
    return repos.filter((r) => (scores.get(r.id) ?? 0) > 0).sort(
      (a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0),
    );
  }
  const movers = repos.filter((r) => (r.starsDelta24h ?? 0) > 0);
  const pool = movers.length > 0 ? movers : repos;
  const scores = computeTopComposite(pool, "24h");
  return [...pool].sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0));
}

function maxPerDay(): number {
  const n = Number.parseInt(process.env.TRENDING_POST_MAX_PER_DAY ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

function singleMediaPath(repo: Repo): string {
  return `/api/og/repo/${repo.fullName}`;
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

async function readLedger(): Promise<TrendingLedger> {
  const store = getDataStore();
  try {
    const res = await store.read<TrendingLedger>(TRENDING_LEDGER_SLUG);
    const ledger =
      res.data && Array.isArray(res.data.posts)
        ? res.data
        : res.source === "missing"
          ? { posts: [] }
          : null;

    if (!ledger) {
      throw new Error(`invalid outbound ledger from ${res.source}`);
    }
    if (res.source !== "redis") {
      await store.write(TRENDING_LEDGER_SLUG, ledger);
    }
    return ledger;
  } catch (err) {
    throw new DataStoreFatalError(
      "[twitter-trending] outbound ledger read failed; refusing to select without cap/cooldown state",
      { cause: err instanceof Error ? err.message : String(err) },
    );
  }
}

interface LedgerState {
  cooldownFullNames: Set<string>;
  postedTodayCount: number;
}

/** Single with criteria copy — the classic path and every format's fallback. */
function proposeSingle(
  repos: Repo[],
  state: LedgerState,
  cap: number,
  ranker: TrendingRanker = "top",
): TrendingProposal {
  const ranked = rankTrendingCandidates(repos, ranker);
  if (ranked.length === 0) return { post: false, reason: "no-candidates" };
  const repo = selectTrendingPost(ranked, state, cap);
  if (!repo) return { post: false, reason: "all-top-repos-in-cooldown" };
  const composed = composeTrendingSingle(repo);
  return {
    post: true,
    format: "trending_single",
    ranker,
    repoId: repo.id,
    fullName: repo.fullName,
    fullNames: [repo.fullName],
    text: composed.text,
    url: composed.url ?? undefined,
    mediaPath: singleMediaPath(repo),
  };
}

/**
 * Optional LLM pass (CE-5): NanoGPT/Kimi may sharpen the hook, but the
 * validators reject any output that drops a number, renames a repo, mutates
 * a pack list line, or busts the budget — then the deterministic copy ships.
 */
async function withPolish(p: TrendingProposal): Promise<TrendingProposal> {
  if (!p.post || !p.text) return p;
  const frozenLines =
    p.format === "trending_pack"
      ? p.text.split("\n").filter((l) => /^\d+\. /.test(l))
      : [];
  const polished = await polishTweet({
    draft: p.text,
    mustInclude: p.fullNames ?? [],
    frozenLines,
    budget: 246,
  });
  return polished
    ? { ...p, text: polished, source: "llm" }
    : { ...p, source: "deterministic" };
}

/** Decide + compose the next tweet without committing anything. */
export async function proposeTrendingPost(
  nowMs: number = Date.now(),
  slot?: SlotId,
): Promise<TrendingProposal> {
  await Promise.allSettled([
    refreshTrendingFromStore(),
    refreshRecentReposFromStore(),
    refreshRepoMetadataFromStore(),
    refreshRepoRegistryFromStore(),
    refreshStarActivityDeltasFromStore(),
    refreshTwitterSignalsFromStore(),
    refreshAllMentionStores(),
  ]);
  const repos = getDerivedRepos();
  const cap = maxPerDay();
  const state = computeLedgerState(await readLedger(), nowMs);
  if (state.postedTodayCount >= cap) {
    return { post: false, reason: `daily-cap-reached (${state.postedTodayCount}/${cap})` };
  }

  const resolved = slot
    ? resolveSlotFormat(nowMs, slot)
    : ({ format: "trending_single", ranker: "top" } as const);

  if (resolved.format === "trending_pack") {
    const pack = getPack(resolved.packId ?? "");
    const members = pack ? selectPackRepos(repos, pack, state.cooldownFullNames) : [];
    if (pack && members.length > 0) {
      const composed = composeTrendingPack(members, pack);
      const slugs = members.map((r) => r.fullName);
      return withPolish({
        post: true,
        format: "trending_pack",
        packId: pack.id,
        ranker: resolved.ranker ?? "top",
        fullName: slugs[0],
        fullNames: slugs,
        text: composed.text,
        url: composed.url ?? undefined,
        mediaPath: `/api/og/top10?my=${encodeURIComponent(slugs.join(","))}&rows=${pack.size}&theme=dark`,
      });
    }
    // Thin pack (< size matches after spam/cooldown) — fall through to single.
  }

  if (resolved.format === "discovery_single") {
    const pool = repos.filter(
      (r) => !isSpamRepo(r) && !state.cooldownFullNames.has(r.fullName.toLowerCase()),
    );
    const gem = pickTopDiscoveryRepo(pool);
    if (gem) {
      const composed = composeTrendingSingle(gem);
      return withPolish({
        post: true,
        format: "discovery_single",
        ranker: "discovery",
        repoId: gem.id,
        fullName: gem.fullName,
        fullNames: [gem.fullName],
        text: composed.text,
        url: composed.url ?? undefined,
        mediaPath: singleMediaPath(gem),
      });
    }
    // No eligible gem today — fall through to single.
  }

  return withPolish(proposeSingle(repos, state, cap, resolved.ranker));
}

/** Commit a confirmed post to the durable ledger + audit trail. */
export async function confirmTrendingPost(
  confirm: TrendingConfirm,
  nowMs: number = Date.now(),
): Promise<void> {
  const format = confirm.format ?? "trending_single";
  let ledger = await readLedger();
  let changed = false;
  for (const fullName of confirm.fullNames) {
    const next = appendLedgerPost(ledger, {
      date: utcDate(nowMs),
      ts: new Date(nowMs).toISOString(),
      fullName,
      tweetId: confirm.tweetId,
      text: confirm.text,
      format,
      ...(confirm.packId ? { packId: confirm.packId } : {}),
      ...(confirm.ranker ? { ranker: confirm.ranker } : {}),
    });
    changed ||= next !== ledger;
    ledger = next;
  }
  if (!changed) return;
  await getDataStore().write(TRENDING_LEDGER_SLUG, ledger);

  // Copy audit trail — append-only, capped, best-effort (never blocks confirm).
  try {
    const cur = await getDataStore().read<{ posts: unknown[] }>(X_CONTENT_LEDGER_SLUG);
    const posts = [
      ...(Array.isArray(cur.data?.posts) ? cur.data.posts : []),
      {
        date: utcDate(nowMs),
        ts: new Date(nowMs).toISOString(),
        tweetId: confirm.tweetId,
        format,
        ...(confirm.packId ? { packId: confirm.packId } : {}),
        ...(confirm.ranker ? { ranker: confirm.ranker } : {}),
        ...(confirm.source ? { source: confirm.source } : {}),
        fullNames: confirm.fullNames,
        text: confirm.text,
      },
    ].slice(-CONTENT_LEDGER_MAX);
    await getDataStore().write(X_CONTENT_LEDGER_SLUG, { posts });
  } catch {
    /* copy log is advisory */
  }

  await recordOutboundRun({
    kind: format === "trending_pack" ? "trending_pack" : "trending_single",
    adapterName: "twitter_cli_host",
    status: "published",
    threadUrl: `https://x.com/i/status/${confirm.tweetId}`,
    postCount: 1,
    startedAt: new Date(nowMs).toISOString(),
  }).catch(() => undefined);
}
