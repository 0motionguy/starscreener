// /githubrepo ranker — UNION of Trendshift + OSS Insight raw rankings.
//
// User constraint (2026-05-07): "/github should LEAD YOU TO TOP 50 but also
// not with our own score we need to use either Trendshift or OSS Insight
// both for ranker". This helper deliberately ignores the in-house
// momentum / cross-signal / consensus-trending scores. We read what each
// upstream already published, dedupe by `owner/name`, and rank by the
// minimum-position-across-sources (smallest wins).
//
// Inputs:
//   - data-store key `trending`         → OSS Insight buckets
//                                          (past_24_hours / All used as the
//                                          canonical 100-row daily list).
//   - data-store key `trendshift-daily` → trendshift.io's daily top 100.
//
// Output: at most 50 rows, each with `{ trendshiftRank?, ossRank?, minRank,
// sumRank, sourceCount }` so the page can render attribution chips
// inline. Repos appearing in both lists naturally float to the top
// (smallest min-rank, smallest sum-rank tiebreak).

import { createPayloadReader } from "./data-store-reader";
import {
  getLastFetchedAt,
  getTrending,
  refreshTrendingFromStore,
} from "./trending";

// Trendshift payload — kept loose; matches the worker's
// TrendshiftDailyPayload contract but defined locally so the app doesn't
// depend on the worker package.
interface TrendshiftItem {
  fullName: string;
  rank: number;
  repositoryId: number | null;
  url: string;
  source: "trendshift";
}

interface TrendshiftPayload {
  fetchedAt: string;
  sourceUrl: string;
  itemCount: number;
  items: TrendshiftItem[];
}

const EMPTY_TRENDSHIFT: TrendshiftPayload = {
  fetchedAt: "",
  sourceUrl: "",
  itemCount: 0,
  items: [],
};

const trendshiftReader = createPayloadReader<TrendshiftPayload>({
  key: "trendshift-daily",
  emptyPayload: EMPTY_TRENDSHIFT,
  normalize: (raw): TrendshiftPayload => {
    const value = raw as Partial<TrendshiftPayload> | null | undefined;
    if (!value || !Array.isArray(value.items)) return EMPTY_TRENDSHIFT;
    return {
      fetchedAt: typeof value.fetchedAt === "string" ? value.fetchedAt : "",
      sourceUrl: typeof value.sourceUrl === "string" ? value.sourceUrl : "",
      itemCount: typeof value.itemCount === "number" ? value.itemCount : value.items.length,
      items: value.items
        .filter(
          (item): item is TrendshiftItem =>
            !!item &&
            typeof item.fullName === "string" &&
            item.fullName.includes("/") &&
            typeof item.rank === "number" &&
            Number.isFinite(item.rank),
        )
        .map((item) => ({
          fullName: item.fullName,
          rank: item.rank,
          repositoryId: item.repositoryId ?? null,
          url:
            typeof item.url === "string" && item.url
              ? item.url
              : `https://trendshift.io/repositories/${item.repositoryId ?? ""}`,
          source: "trendshift",
        })),
    };
  },
});

export const refreshTrendshiftFromStore = trendshiftReader.refresh;
export const getTrendshiftPayload = trendshiftReader.getPayload;
export const _resetTrendshiftCacheForTests = trendshiftReader.reset;

export interface ConsensusRow {
  fullName: string;
  owner: string;
  name: string;
  /** 1-indexed position on Trendshift's daily list. null when absent. */
  trendshiftRank: number | null;
  /** 1-indexed position on OSS Insight past_24_hours/All. null when absent. */
  ossRank: number | null;
  /** Minimum rank across present sources. Ranks both lists ascending. */
  minRank: number;
  /** Sum of present ranks — secondary tiebreak. */
  sumRank: number;
  /** Count of sources where this repo appears (1 or 2). */
  sourceCount: 1 | 2;
  /** Optional description from OSS Insight. Empty string if unavailable. */
  description: string;
  /** Primary language from OSS Insight. null when unavailable. */
  language: string | null;
  /** Stars count from OSS Insight (parsed). null when unavailable. */
  stars: number | null;
  /** Trendshift listing URL when present — null otherwise. */
  trendshiftUrl: string | null;
}

export interface ConsensusResult {
  rows: ConsensusRow[];
  trendshiftCount: number;
  ossCount: number;
  unionCount: number;
  trendshiftFetchedAt: string | null;
  ossFetchedAt: string | null;
}

interface SourceEntry {
  trendshiftRank: number | null;
  ossRank: number | null;
  description: string;
  language: string | null;
  stars: number | null;
  trendshiftUrl: string | null;
}

/**
 * Refresh both upstreams (in parallel), then build the merged top-N list.
 * Cheap to call on every render — both readers internally rate-limit to 30s.
 */
export async function getGithubTrendingConsensus(
  limit = 50,
): Promise<ConsensusResult> {
  await Promise.all([refreshTrendingFromStore(), refreshTrendshiftFromStore()]);

  const trendshift = getTrendshiftPayload();
  const ossRows = getTrending("past_24_hours", "All");

  // Lower-cased fullName → canonical entry. fullName from the FIRST source
  // wins case-wise to avoid flicker when both lists differ on capitalization.
  const byKey = new Map<string, { fullName: string; entry: SourceEntry }>();

  // 1) Trendshift first — gives us the trendshift URL + rank.
  for (const item of trendshift.items) {
    const key = item.fullName.toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      // Keep the smaller rank if duplicated within a source (shouldn't happen).
      if (
        existing.entry.trendshiftRank === null ||
        item.rank < existing.entry.trendshiftRank
      ) {
        existing.entry.trendshiftRank = item.rank;
        existing.entry.trendshiftUrl = item.url;
      }
      continue;
    }
    byKey.set(key, {
      fullName: item.fullName,
      entry: {
        trendshiftRank: item.rank,
        ossRank: null,
        description: "",
        language: null,
        stars: null,
        trendshiftUrl: item.url,
      },
    });
  }

  // 2) OSS Insight — array index = rank (0-based → +1).
  ossRows.forEach((row, index) => {
    if (!row.repo_name || !row.repo_name.includes("/")) return;
    const key = row.repo_name.toLowerCase();
    const rank = index + 1;
    const stars = Number.parseInt(row.stars ?? "", 10);
    const existing = byKey.get(key);
    if (existing) {
      if (existing.entry.ossRank === null || rank < existing.entry.ossRank) {
        existing.entry.ossRank = rank;
      }
      // Always backfill OSS-derived metadata if unset.
      if (!existing.entry.description) existing.entry.description = row.description ?? "";
      if (existing.entry.language === null)
        existing.entry.language = row.primary_language || null;
      if (existing.entry.stars === null && Number.isFinite(stars))
        existing.entry.stars = stars;
      return;
    }
    byKey.set(key, {
      fullName: row.repo_name,
      entry: {
        trendshiftRank: null,
        ossRank: rank,
        description: row.description ?? "",
        language: row.primary_language || null,
        stars: Number.isFinite(stars) ? stars : null,
        trendshiftUrl: null,
      },
    });
  });

  // Build sortable rows.
  const rows: ConsensusRow[] = [];
  for (const { fullName, entry } of byKey.values()) {
    const ranks: number[] = [];
    if (entry.trendshiftRank !== null) ranks.push(entry.trendshiftRank);
    if (entry.ossRank !== null) ranks.push(entry.ossRank);
    if (ranks.length === 0) continue;
    const [owner, name] = fullName.split("/", 2);
    if (!owner || !name) continue;
    rows.push({
      fullName,
      owner,
      name,
      trendshiftRank: entry.trendshiftRank,
      ossRank: entry.ossRank,
      minRank: Math.min(...ranks),
      sumRank: ranks.reduce((a, b) => a + b, 0),
      sourceCount: ranks.length === 2 ? 2 : 1,
      description: entry.description,
      language: entry.language,
      stars: entry.stars,
      trendshiftUrl: entry.trendshiftUrl,
    });
  }

  // Sort: minRank asc → sumRank asc → name asc.
  rows.sort((a, b) => {
    if (a.minRank !== b.minRank) return a.minRank - b.minRank;
    if (a.sumRank !== b.sumRank) return a.sumRank - b.sumRank;
    return a.fullName.localeCompare(b.fullName);
  });

  return {
    rows: rows.slice(0, Math.max(0, limit)),
    trendshiftCount: trendshift.items.length,
    ossCount: ossRows.length,
    unionCount: rows.length,
    trendshiftFetchedAt: trendshift.fetchedAt || null,
    ossFetchedAt: getLastFetchedAt() || null,
  };
}
