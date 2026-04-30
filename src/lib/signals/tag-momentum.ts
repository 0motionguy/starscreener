// Tag momentum heatmap.
//
// Builds a 12-tag × 24-hour grid from cross-source SignalItem[]. Each tag's
// row holds 24 normalized intensities (0..1) — the share of that tag's
// volume in each UTC hour of the past 24h. Rendered by TagMomentumHeatmap.
//
// Tag selection:
//   1. Source-native tags (item.tags[]) when present (Bluesky / Dev.to)
//   2. Title-token extraction for the rest, using the same stopword filter
//      already applied by src/components/news/newsTopMetrics.ts (kept inline
//      here to avoid a fragile import-cycle through news code).

import type { SignalItem } from "./types";

export interface TagRow {
  tag: string;
  count: number;
  /** 24 intensities, each 0..1. */
  pattern: number[];
  /** "hot" | "warm" | "cool" trend classification — drives heatmap palette. */
  trend: "hot" | "warm" | "cool";
  /** Recent-12h vs prior-12h count delta. */
  delta: number;
}

export interface TagMomentumSummary {
  rows: TagRow[];
  /** The single hottest tag — used in the KPI strip. */
  topTag: TagRow | null;
}

const STOP = new Set([
  // articles, prepositions, pronouns, common verbs
  "a","an","the","and","or","but","of","to","for","in","on","at","with","by","is","are","was","were","be","been","it","its","this","that","i","we","you","they","he","she","as","from","into","over","via","just","not","no","yes","do","does","did","has","have","had","will","can","could","should","would","may","might",
  // throwaway news verbs
  "says","said","saw","ships","shipped","launches","launched","launching","announcing","announces","announced","released","release","releases","update","updated","updating","new","first","best","top","why","how","what","when","where","versus","vs",
  // generic dev nouns
  "code","tool","tools","build","build","app","apps","github","repo","repos","project","projects","week","day","today","year","years","hours","hour","minutes","really","actually",
]);

function tokenize(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\-#]/gu, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[\-#]+|[\-#]+$/g, ""))
    .filter((w) => w.length >= 4 && !STOP.has(w));
}

function extractItemTags(item: SignalItem): string[] {
  const out = new Set<string>();
  for (const t of item.tags ?? []) {
    const lower = String(t).trim().toLowerCase();
    if (lower.length >= 3 && lower.length <= 24) out.add(lower);
  }
  // Also pull a few title tokens to cover sources without tags.
  for (const tok of tokenize(item.title)) {
    if (out.size >= 6) break;
    out.add(tok);
  }
  if (item.linkedRepo) {
    // The repo name itself is a tag for the consensus heatmap.
    const name = item.linkedRepo.split("/")[1];
    if (name && name.length >= 3) out.add(name.toLowerCase());
  }
  return Array.from(out);
}

export interface BuildTagMomentumOpts {
  nowMs?: number;
  /** Number of tag rows to keep. Default 12. */
  topN?: number;
}

export function buildTagMomentum(
  items: SignalItem[],
  opts: BuildTagMomentumOpts = {},
): TagMomentumSummary {
  const nowMs = opts.nowMs ?? Date.now();
  const topN = opts.topN ?? 12;

  const cutoff = nowMs - 24 * 3_600_000;
  const tagBuckets = new Map<string, number[]>();
  const tagCounts = new Map<string, number>();
  const tagRecent = new Map<string, number>();
  const tagPrior = new Map<string, number>();

  const recentCutoff = nowMs - 12 * 3_600_000;

  for (const item of items) {
    if (!item.postedAtMs || item.postedAtMs < cutoff || item.postedAtMs > nowMs)
      continue;
    const hour = new Date(item.postedAtMs).getUTCHours();
    const tags = extractItemTags(item);
    if (tags.length === 0) continue;
    const isRecent = item.postedAtMs >= recentCutoff;

    for (const tag of tags) {
      let row = tagBuckets.get(tag);
      if (!row) {
        row = new Array(24).fill(0);
        tagBuckets.set(tag, row);
      }
      row[hour] += 1;
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      if (isRecent) tagRecent.set(tag, (tagRecent.get(tag) ?? 0) + 1);
      else tagPrior.set(tag, (tagPrior.get(tag) ?? 0) + 1);
    }
  }

  // Top N by count
  const ranked = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);

  const rows: TagRow[] = ranked.map(([tag, count]) => {
    const raw = tagBuckets.get(tag) ?? new Array(24).fill(0);
    const max = Math.max(...raw, 1);
    const pattern = raw.map((v) => Math.round((v / max) * 100) / 100);
    const recent = tagRecent.get(tag) ?? 0;
    const prior = tagPrior.get(tag) ?? 0;
    const delta = recent - prior;
    const trend: TagRow["trend"] =
      recent >= prior * 1.5 && recent >= 3
        ? "hot"
        : recent >= prior
          ? "warm"
          : "cool";
    return { tag, count, pattern, trend, delta };
  });

  return {
    rows,
    topTag: rows[0] ?? null,
  };
}
