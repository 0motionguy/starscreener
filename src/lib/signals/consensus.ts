// Cross-source consensus radar.
//
// Groups SignalItem[] from every source by canonical key with priority:
//   1. linkedRepo (lowercased owner/name) — strongest signal
//   2. URL canonical (host + first path segment) — weaker but covers RSS / news
//   3. fallback: bigram trigram of normalized title — catches identical
//      headlines from different aggregators
//
// Returns ConsensusStory[] for groups with >= MIN_SOURCES distinct sources,
// scored by sum of per-item signalScore (capped) + a source-diversity bonus.

import type { SignalItem, SourceKey } from "./types";

const MIN_SOURCES = 3;

export interface ConsensusStory {
  key: string;
  /** Most representative title — picked as the longest non-empty title in the group. */
  title: string;
  /** Distinct sources observed in this group. */
  sources: SourceKey[];
  /** Highest-scoring item (used for primary URL + tag chip). */
  lead: SignalItem;
  /** All items grouped under this story. */
  items: SignalItem[];
  /** linkedRepo if any item exposes one, else null. */
  linkedRepo: string | null;
  /** Top extracted tag (most common across grouped items). */
  topTag: string | null;
  /** Composite score (sum of signalScore × source-diversity multiplier). */
  score: number;
  /** Recent-vs-prior change indicator (in items count). */
  delta: number;
  /** Sparkline buckets (12-point) of postedAt density. */
  spark: number[];
}

function canonicalUrlKey(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.host.replace(/^www\./, "");
    // Prefix with "url:" so the key namespace doesn't collide with "repo:".
    // Use only first 2 path segments — strips utm params, fragments, deep paths.
    const seg = u.pathname.split("/").filter(Boolean).slice(0, 2).join("/");
    return `url:${host}/${seg}`;
  } catch {
    return null;
  }
}

const STOP = new Set([
  "a","an","the","and","or","but","of","to","for","in","on","at","with","by","is","are","was","were","be","been","it","its","this","that","i","we","you","they","he","she","as","from","into","over","via","new","just","first","best","top","why","how","what","when","where","says","said","saw","will","not","no","yes","more","less","why",
]);

function normTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .slice(0, 8)
    .join(" ");
}

function titleKey(title: string): string | null {
  const norm = normTitle(title);
  if (norm.length < 10) return null;
  return `title:${norm}`;
}

function groupKey(item: SignalItem): string | null {
  if (item.linkedRepo) return `repo:${item.linkedRepo.toLowerCase()}`;
  const u = canonicalUrlKey(item.url);
  if (u) return u;
  return titleKey(item.title);
}

function pickLead(items: SignalItem[]): SignalItem {
  return items.reduce((best, it) =>
    (it.signalScore > best.signalScore ? it : best),
  items[0]);
}

function pickTitle(items: SignalItem[]): string {
  // Longest non-empty title — usually the most informative.
  let best = items[0]?.title ?? "";
  for (const it of items) {
    if (it.title.length > best.length) best = it.title;
  }
  return best;
}

function pickTopTag(items: SignalItem[]): string | null {
  const counts = new Map<string, number>();
  for (const it of items) {
    for (const t of it.tags) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  let bestTag: string | null = null;
  let bestCount = 0;
  for (const [tag, n] of counts) {
    if (n > bestCount) {
      bestCount = n;
      bestTag = tag;
    }
  }
  return bestTag;
}

/**
 * Build a 12-bucket density sparkline of postedAtMs across the group.
 * Buckets span the past `lookbackHours`. Empty groups → flat zeros.
 */
function buildSpark(
  items: SignalItem[],
  nowMs: number,
  lookbackHours: number,
): number[] {
  const buckets = new Array(12).fill(0);
  const windowMs = lookbackHours * 3_600_000;
  const start = nowMs - windowMs;
  const bucketMs = windowMs / 12;
  for (const it of items) {
    if (!it.postedAtMs || it.postedAtMs < start) continue;
    const idx = Math.min(11, Math.floor((it.postedAtMs - start) / bucketMs));
    buckets[idx] += 1;
  }
  return buckets;
}

function computeDelta(
  items: SignalItem[],
  nowMs: number,
  lookbackHours: number,
): number {
  // Recent half count minus older half count. Splits the window in two.
  const halfMs = (lookbackHours / 2) * 3_600_000;
  const halfAgo = nowMs - halfMs;
  const fullAgo = nowMs - lookbackHours * 3_600_000;
  let recent = 0;
  let prior = 0;
  for (const it of items) {
    if (!it.postedAtMs) continue;
    if (it.postedAtMs >= halfAgo) recent += 1;
    else if (it.postedAtMs >= fullAgo) prior += 1;
  }
  return recent - prior;
}

export interface BuildConsensusOpts {
  nowMs?: number;
  minSources?: number;
  limit?: number;
  /** Look-back window in hours for the sparkline + delta. Default 24. */
  lookbackHours?: number;
}

export function buildConsensus(
  items: SignalItem[],
  opts: BuildConsensusOpts = {},
): ConsensusStory[] {
  const nowMs = opts.nowMs ?? Date.now();
  const minSources = opts.minSources ?? MIN_SOURCES;
  const limit = opts.limit ?? 8;
  const lookbackHours = Math.max(1, opts.lookbackHours ?? 24);

  const groups = new Map<string, SignalItem[]>();
  for (const item of items) {
    const key = groupKey(item);
    if (!key) continue;
    const arr = groups.get(key);
    if (arr) arr.push(item);
    else groups.set(key, [item]);
  }

  const out: ConsensusStory[] = [];
  for (const [key, arr] of groups) {
    const sourceSet = new Set<SourceKey>();
    for (const it of arr) sourceSet.add(it.source);
    if (sourceSet.size < minSources) continue;

    const lead = pickLead(arr);
    const title = pickTitle(arr);
    const sources = Array.from(sourceSet);

    // Score: sum of capped signalScores × source-diversity multiplier.
    let raw = 0;
    for (const it of arr) {
      raw += Math.min(100, it.signalScore);
    }
    const diversity = 1 + (sources.length - minSources) * 0.18;
    const score = Math.round(raw * diversity * 10) / 10;

    out.push({
      key,
      title,
      sources,
      lead,
      items: arr,
      linkedRepo: arr.find((x) => x.linkedRepo)?.linkedRepo ?? null,
      topTag: pickTopTag(arr),
      score,
      delta: computeDelta(arr, nowMs, lookbackHours),
      spark: buildSpark(arr, nowMs, lookbackHours),
    });
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}
