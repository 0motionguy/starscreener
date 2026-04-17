// StarScreener Pipeline — featured cards waterfall
//
// Produces an ordered list of hero "Featured" cards for the terminal
// homepage. Runs a priority waterfall: #1 Today → Biggest Breakout →
// Top Rank Climber → HN Featured → Fresh Major Release → Most Discussed →
// Quiet Killer → Watched & Moving. Dedupes by repo id, backfills from
// getTopMovers when fewer than 4 natural candidates, and truncates to
// the requested limit.

import type {
  FeaturedCard,
  FeaturedLabel,
  MetaFilter,
  Repo,
} from "../../types";
import {
  mentionStore,
  reasonStore,
  repoStore,
} from "../storage/singleton";
import {
  getBreakouts,
  getMostDiscussed,
  getQuietKillers,
  getTopMovers,
} from "./service";

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Apply a MetaFilter to a repo pool (inline of the dedicated filter lib). */
function applyMetaFilter(repos: Repo[], filter: MetaFilter): Repo[] {
  const now = Date.now();
  switch (filter) {
    case "hot":
      return repos.filter((r) => r.movementStatus === "hot");
    case "breakouts":
      return repos.filter((r) => r.movementStatus === "breakout");
    case "quiet-killers":
      return repos.filter((r) => r.movementStatus === "quiet_killer");
    case "new":
      return repos.filter((r) => {
        const created = Date.parse(r.createdAt);
        if (!Number.isFinite(created)) return false;
        return now - created < 30 * MS_PER_DAY;
      });
    case "discussed":
      return repos.filter((r) => r.mentionCount24h > 0);
    case "rank-climbers":
      return repos.filter((r) => r.rank > 0 && r.rank <= 20);
    case "fresh-releases":
      return repos.filter((r) => {
        if (!r.lastReleaseAt) return false;
        const t = Date.parse(r.lastReleaseAt);
        if (!Number.isFinite(t)) return false;
        return now - t < 7 * MS_PER_DAY;
      });
  }
}

function computeDeltaPercent(repo: Repo): number {
  return (repo.starsDelta24h / Math.max(repo.stars, 1)) * 100;
}

/** Pull a rank-delta number from the rank_jump reason's evidence list. */
function rankDeltaFromReason(repoId: string): number | null {
  const reason = reasonStore.get(repoId);
  if (!reason) return null;
  for (const d of reason.details) {
    if (d.code === "rank_jump") {
      for (const ev of d.evidence) {
        if (ev.label === "Places gained" && typeof ev.value === "number") {
          return ev.value;
        }
      }
    }
  }
  return null;
}

/** Human-readable fallback when no stored reason summary exists. */
function synthReason(label: FeaturedLabel, repo: Repo): string {
  switch (label) {
    case "NUMBER_ONE_TODAY":
      return `Leading today with +${repo.starsDelta24h.toLocaleString()} stars`;
    case "BREAKOUT":
      return `Breakout — momentum accelerating into the top tier`;
    case "RANK_CLIMBER":
      return `Climbing fast — now ranked #${repo.rank} overall`;
    case "HN_FEATURED":
      return `Featured on Hacker News front page in the last 24h`;
    case "FRESH_RELEASE":
      return repo.lastReleaseTag
        ? `Shipped ${repo.lastReleaseTag} recently`
        : `Fresh major release in the last 48h`;
    case "MOST_DISCUSSED":
      return `Most discussed — ${repo.mentionCount24h} mentions in 24h`;
    case "QUIET_KILLER":
      return `Quiet killer — steady sustained growth, no single spike`;
    case "WATCHED_MOVING":
      return `Watched & moving — ${repo.starsDelta7d >= 0 ? "+" : ""}${repo.starsDelta7d.toLocaleString()} stars in 7d`;
  }
}

function buildCard(
  repo: Repo,
  label: FeaturedLabel,
  labelDisplay: string,
): FeaturedCard {
  const storedSummary = reasonStore.get(repo.id)?.summary;
  const reason =
    storedSummary && storedSummary.trim().length > 0
      ? storedSummary
      : synthReason(label, repo);

  let rankDelta: number | null = null;
  if (label === "RANK_CLIMBER") {
    rankDelta = rankDeltaFromReason(repo.id);
  }

  return {
    label,
    labelDisplay,
    repo,
    reason,
    deltaPercent: computeDeltaPercent(repo),
    rankDelta,
    sparkline: repo.sparklineData,
  };
}

// ---------------------------------------------------------------------------
// Waterfall candidate pickers
// ---------------------------------------------------------------------------

function pickNumberOneToday(pool: Repo[], seen: Set<string>): FeaturedCard | null {
  let best: Repo | null = null;
  for (const r of pool) {
    if (seen.has(r.id)) continue;
    if (!best || r.starsDelta24h > best.starsDelta24h) {
      best = r;
    }
  }
  if (!best || best.starsDelta24h <= 0) return null;
  return buildCard(best, "NUMBER_ONE_TODAY", "#1 TODAY");
}

function pickBreakout(pool: Repo[], seen: Set<string>): FeaturedCard | null {
  const poolIds = new Set(pool.map((r) => r.id));
  const candidates = getBreakouts(5).filter(
    (r) => poolIds.has(r.id) && !seen.has(r.id),
  );
  if (candidates.length === 0) return null;
  return buildCard(candidates[0], "BREAKOUT", "BREAKOUT");
}

function pickRankClimber(pool: Repo[], seen: Set<string>): FeaturedCard | null {
  // Prefer a repo with an explicit rank_jump reason code.
  for (const r of pool) {
    if (seen.has(r.id)) continue;
    const reason = reasonStore.get(r.id);
    if (reason && reason.codes.includes("rank_jump")) {
      return buildCard(r, "RANK_CLIMBER", "RANK CLIMBER");
    }
  }
  // Fallback: first repo with rank 1-20 not yet seen, sorted by rank asc.
  const sorted = pool
    .filter((r) => !seen.has(r.id) && r.rank > 0 && r.rank <= 20)
    .sort((a, b) => a.rank - b.rank);
  if (sorted.length === 0) return null;
  return buildCard(sorted[0], "RANK_CLIMBER", "RANK CLIMBER");
}

function pickHnFeatured(pool: Repo[], seen: Set<string>): FeaturedCard | null {
  const now = Date.now();
  for (const repo of pool) {
    if (seen.has(repo.id)) continue;
    const mentions = mentionStore.listForRepo(repo.id);
    for (const m of mentions) {
      if (m.platform !== "hackernews") continue;
      if (m.engagement < 50) continue;
      const postedAt = Date.parse(m.postedAt);
      if (!Number.isFinite(postedAt)) continue;
      if (now - postedAt > 24 * MS_PER_HOUR) continue;
      return buildCard(repo, "HN_FEATURED", "HN FEATURED");
    }
  }
  return null;
}

function pickFreshRelease(pool: Repo[], seen: Set<string>): FeaturedCard | null {
  const now = Date.now();
  const poolIds = new Set(pool.map((r) => r.id));

  // Try reason-backed first (release_major within 48h).
  for (const repo of pool) {
    if (seen.has(repo.id)) continue;
    const reason = reasonStore.get(repo.id);
    if (!reason || !reason.codes.includes("release_major")) continue;
    if (!repo.lastReleaseAt) continue;
    const t = Date.parse(repo.lastReleaseAt);
    if (!Number.isFinite(t)) continue;
    if (now - t > 48 * MS_PER_HOUR) continue;
    return buildCard(repo, "FRESH_RELEASE", "FRESH RELEASE");
  }

  // Fallback: any repo with release in last 48h.
  const candidates = pool
    .filter((r) => {
      if (seen.has(r.id) || !poolIds.has(r.id)) return false;
      if (!r.lastReleaseAt) return false;
      const t = Date.parse(r.lastReleaseAt);
      if (!Number.isFinite(t)) return false;
      return now - t < 48 * MS_PER_HOUR;
    })
    .sort((a, b) => {
      const ta = Date.parse(a.lastReleaseAt as string);
      const tb = Date.parse(b.lastReleaseAt as string);
      return tb - ta;
    });
  if (candidates.length === 0) return null;
  return buildCard(candidates[0], "FRESH_RELEASE", "FRESH RELEASE");
}

function pickMostDiscussed(pool: Repo[], seen: Set<string>): FeaturedCard | null {
  const poolIds = new Set(pool.map((r) => r.id));
  const candidates = getMostDiscussed(10).filter(
    (r) => poolIds.has(r.id) && !seen.has(r.id),
  );
  if (candidates.length === 0) return null;
  return buildCard(candidates[0], "MOST_DISCUSSED", "MOST DISCUSSED");
}

function pickQuietKiller(pool: Repo[], seen: Set<string>): FeaturedCard | null {
  const poolIds = new Set(pool.map((r) => r.id));
  const candidates = getQuietKillers(5).filter(
    (r) => poolIds.has(r.id) && !seen.has(r.id),
  );
  if (candidates.length === 0) return null;
  return buildCard(candidates[0], "QUIET_KILLER", "QUIET KILLER");
}

function pickWatchedMoving(
  pool: Repo[],
  seen: Set<string>,
  watchlistIds: string[],
): FeaturedCard | null {
  const watchlistSet = new Set(watchlistIds);
  const candidates = pool
    .filter((r) => watchlistSet.has(r.id) && !seen.has(r.id))
    .filter((r) => {
      const base = Math.max(r.stars - r.starsDelta7d, 1);
      const pct = Math.abs((r.starsDelta7d / base) * 100);
      return pct > 10;
    })
    .sort(
      (a, b) => Math.abs(b.starsDelta7d) - Math.abs(a.starsDelta7d),
    );
  if (candidates.length === 0) return null;
  return buildCard(candidates[0], "WATCHED_MOVING", "WATCHED & MOVING");
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function getFeaturedTrending(opts?: {
  limit?: number;
  watchlistRepoIds?: string[];
  metaFilter?: MetaFilter | null;
}): FeaturedCard[] {
  const limit = Math.max(1, Math.min(20, opts?.limit ?? 8));
  const watchlistIds = opts?.watchlistRepoIds ?? [];
  const metaFilter = opts?.metaFilter ?? null;

  // Build the candidate pool. When metaFilter is set, narrow the pool
  // up-front — every downstream picker respects this scope.
  let pool = repoStore.getAll();
  if (metaFilter) {
    pool = applyMetaFilter(pool, metaFilter);
  }

  const cards: FeaturedCard[] = [];
  const seen = new Set<string>();

  const pickers: Array<() => FeaturedCard | null> = [
    () => pickNumberOneToday(pool, seen),
    () => pickBreakout(pool, seen),
    () => pickRankClimber(pool, seen),
    () => pickHnFeatured(pool, seen),
    () => pickFreshRelease(pool, seen),
    () => pickMostDiscussed(pool, seen),
    () => pickQuietKiller(pool, seen),
    () => pickWatchedMoving(pool, seen, watchlistIds),
  ];

  for (const pick of pickers) {
    const card = pick();
    if (card && !seen.has(card.repo.id)) {
      cards.push(card);
      seen.add(card.repo.id);
    }
  }

  // Backfill from getTopMovers("today") with secondary #N TODAY cards when
  // the natural waterfall produced too few candidates. We intentionally cap
  // the "natural" threshold at 4 (per plan) — above that, we trust the
  // waterfall's signal and don't bulk up with filler.
  if (cards.length < 4) {
    const poolIds = new Set(pool.map((r) => r.id));
    const backfillPool = getTopMovers("today", 20).filter(
      (r) => poolIds.has(r.id) && !seen.has(r.id),
    );
    let position = cards.length + 1; // human-readable "#2 TODAY", "#3 TODAY", ...
    for (const repo of backfillPool) {
      if (cards.length >= Math.max(4, limit)) break;
      cards.push(
        buildCard(repo, "NUMBER_ONE_TODAY", `#${position} TODAY`),
      );
      seen.add(repo.id);
      position += 1;
    }
  }

  return cards.slice(0, limit);
}
