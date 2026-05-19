// TrendShift daily trending reader.
//
// The worker (apps/trendingrepo-worker/src/fetchers/trendshift-daily) scrapes
// https://trendshift.io/?trending-limit=100 hourly and writes to Redis under
// the `trendshift-daily` key. This module reads that payload through the
// shared data-store-reader factory (Redis -> bundled seed -> in-memory cache).
//
// Bundled seed lives at data/trendshift-daily.json. It can be empty on first
// commit; Redis fills it in on the next worker run.

import seed from "../../data/trendshift-daily.json";
import { createPayloadReader } from "./data-store-reader";

export interface TrendshiftItem {
  fullName: string;
  rank: number;
  repositoryId: number | null;
  url: string;
  source: "trendshift";
}

export interface TrendshiftPayload {
  fetchedAt: string;
  sourceUrl: string;
  itemCount: number;
  items: TrendshiftItem[];
}

const EMPTY_PAYLOAD: TrendshiftPayload = {
  fetchedAt: "",
  sourceUrl: "https://trendshift.io/?trending-limit=100",
  itemCount: 0,
  items: [],
};

function normalizeItem(input: unknown): TrendshiftItem | null {
  if (!input || typeof input !== "object") return null;
  const it = input as Partial<TrendshiftItem>;
  if (typeof it.fullName !== "string" || !it.fullName.includes("/")) return null;
  if (typeof it.rank !== "number" || !Number.isFinite(it.rank)) return null;
  return {
    fullName: it.fullName,
    rank: it.rank,
    repositoryId:
      typeof it.repositoryId === "number" ? it.repositoryId : null,
    url: typeof it.url === "string" ? it.url : "",
    source: "trendshift",
  };
}

function normalizePayload(input: unknown): TrendshiftPayload {
  if (!input || typeof input !== "object") return EMPTY_PAYLOAD;
  const parsed = input as Partial<TrendshiftPayload>;
  const items = Array.isArray(parsed.items)
    ? parsed.items
        .map(normalizeItem)
        .filter((x): x is TrendshiftItem => x !== null)
    : [];
  return {
    fetchedAt: typeof parsed.fetchedAt === "string" ? parsed.fetchedAt : "",
    sourceUrl:
      typeof parsed.sourceUrl === "string"
        ? parsed.sourceUrl
        : EMPTY_PAYLOAD.sourceUrl,
    itemCount:
      typeof parsed.itemCount === "number" ? parsed.itemCount : items.length,
    items,
  };
}

const seeded = normalizePayload(seed);

const reader = createPayloadReader<TrendshiftPayload>({
  key: "trendshift-daily",
  emptyPayload: seeded,
  normalize: normalizePayload,
});

export const refreshTrendshiftFromStore = reader.refresh;

export function getTrendshiftItems(): TrendshiftItem[] {
  return reader.getPayload().items;
}

export function getTrendshiftPayload(): TrendshiftPayload {
  return reader.getPayload();
}

export function getTrendshiftFetchedAt(): string {
  return reader.getPayload().fetchedAt || seeded.fetchedAt;
}

export const _resetTrendshiftCacheForTests = reader.reset;
