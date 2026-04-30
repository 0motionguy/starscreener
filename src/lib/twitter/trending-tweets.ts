// Twitter / X reader for the cross-source signals page.
//
// The Apify Twitter collector lands per-repo aggregate signals (one record
// per tracked repo) at .data/twitter-repo-signals.jsonl — there is no flat
// "tweet stream" reader. For the Signals terminal, what we want to surface
// is "which repos have the loudest Twitter buzz right now", so this module
// returns a ranked TwitterBuzzItem list extracted from those per-repo
// aggregates.
//
// Keeps the existing per-repo reader (signal-data.ts) untouched.

import { getTwitterSignalSync, getTwitterSignalsDataVersion } from "./signal-data";
import type { TwitterRepoSignal, TwitterMatchedPostPreview } from "./types";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface TwitterBuzzItem {
  fullName: string;
  ownerName: string;
  repoName: string;
  githubUrl: string;
  finalScore: number;
  mentionCount24h: number;
  uniqueAuthors24h: number;
  engagementTotal: number;
  peakHourIso: string | null;
  topPostUrl: string | null;
  badgeLabel: string | null;
  updatedAt: string;
}

export interface TwitterPostItem {
  postId: string;
  postUrl: string;
  authorHandle: string;
  authorAvatarUrl: string | null;
  postedAt: string;
  text: string;
  engagement: number;
  repoFullName: string;
  whyMatched: string;
}

interface BuzzCache {
  signature: string;
  items: TwitterBuzzItem[];
  posts: TwitterPostItem[];
}
let cache: BuzzCache | null = null;

const TWITTER_SIGNALS_PATH = resolve(
  process.cwd(),
  ".data",
  "twitter-repo-signals.jsonl",
);

function loadAll(): TwitterRepoSignal[] {
  try {
    const raw = readFileSync(TWITTER_SIGNALS_PATH, "utf8");
    const out: TwitterRepoSignal[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        out.push(JSON.parse(trimmed) as TwitterRepoSignal);
      } catch {
        // skip malformed
      }
    }
    return out;
  } catch {
    return [];
  }
}

function buildCache(): BuzzCache {
  const signature = getTwitterSignalsDataVersion();
  if (cache && cache.signature === signature) return cache;
  const all = loadAll();

  const items: TwitterBuzzItem[] = [];
  const posts: TwitterPostItem[] = [];
  const seenPostIds = new Set<string>();

  for (const sig of all) {
    if (!sig.githubFullName) continue;
    const m = sig.metrics ?? ({} as TwitterRepoSignal["metrics"]);
    const s = sig.score ?? ({} as TwitterRepoSignal["score"]);
    items.push({
      fullName: sig.githubFullName,
      ownerName: sig.ownerName ?? sig.githubFullName.split("/")[0] ?? "",
      repoName: sig.repoName ?? sig.githubFullName.split("/")[1] ?? "",
      githubUrl: sig.githubUrl ?? `https://github.com/${sig.githubFullName}`,
      finalScore: typeof s?.finalTwitterScore === "number" ? s.finalTwitterScore : 0,
      mentionCount24h: typeof m?.mentionCount24h === "number" ? m.mentionCount24h : 0,
      uniqueAuthors24h: typeof m?.uniqueAuthors24h === "number" ? m.uniqueAuthors24h : 0,
      engagementTotal: typeof m?.engagementTotal === "number" ? m.engagementTotal : 0,
      peakHourIso:
        typeof m?.peakHour24h === "string" && m.peakHour24h.length > 0
          ? m.peakHour24h
          : null,
      topPostUrl:
        typeof m?.topPostUrl === "string" && m.topPostUrl.length > 0
          ? m.topPostUrl
          : null,
      badgeLabel:
        sig.badge && sig.badge.label && sig.badge.state !== "none"
          ? sig.badge.label
          : null,
      updatedAt: sig.updatedAt ?? new Date(0).toISOString(),
    });

    // Flatten topPosts → flat KOL-style tweet feed. Skip duplicate post IDs
    // since the same tweet can mention multiple tracked repos.
    const top: TwitterMatchedPostPreview[] = Array.isArray(sig.topPosts)
      ? sig.topPosts
      : [];
    for (const p of top) {
      if (!p?.postId || seenPostIds.has(p.postId)) continue;
      seenPostIds.add(p.postId);
      posts.push({
        postId: p.postId,
        postUrl: p.postUrl,
        authorHandle: p.authorHandle,
        authorAvatarUrl: p.authorAvatarUrl ?? null,
        postedAt: p.postedAt,
        text: p.text,
        engagement: typeof p.engagement === "number" ? p.engagement : 0,
        repoFullName: sig.githubFullName,
        whyMatched: p.whyMatched ?? "",
      });
    }
  }
  cache = { signature, items, posts };
  return cache;
}

/**
 * Top N repos by Twitter momentum (final twitter score, then mention count).
 * Used by the /signals X panel.
 */
export function getTopTwitterBuzz(limit = 10): TwitterBuzzItem[] {
  const all = buildCache().items.slice();
  all.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    if (b.engagementTotal !== a.engagementTotal)
      return b.engagementTotal - a.engagementTotal;
    return b.mentionCount24h - a.mentionCount24h;
  });
  return all.slice(0, limit);
}

/**
 * Top N individual tweets across all tracked-repo signals, deduped by
 * postId, sorted by recency * engagement (recent loud beats old silent).
 */
export function getTopTwitterPosts(limit = 10): TwitterPostItem[] {
  const all = buildCache().posts.slice();
  const nowMs = Date.now();
  all.sort((a, b) => {
    const score = (p: TwitterPostItem) => {
      const ageHours = Math.max(
        0.5,
        (nowMs - Date.parse(p.postedAt || "")) / 3_600_000,
      );
      const recencyDecay = 1 / Math.log2(ageHours + 2);
      return (p.engagement + 1) * recencyDecay;
    };
    return score(b) - score(a);
  });
  return all.slice(0, limit);
}

/** Total tracked repo signals (for the SOURCES count badge). */
export function getTwitterTrackedRepoCount(): number {
  return buildCache().items.length;
}

/** Most-recent updatedAt across all signals — fetchedAt proxy. */
export function getTwitterLatestUpdatedAt(): string | null {
  const items = buildCache().items;
  if (items.length === 0) return null;
  let best = "";
  for (const it of items) {
    if (it.updatedAt > best) best = it.updatedAt;
  }
  return best || null;
}

/** Per-repo lookup pass-through (kept for symmetry — same signal-data reader). */
export { getTwitterSignalSync };
