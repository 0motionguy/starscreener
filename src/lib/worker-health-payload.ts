import "server-only";

import { gunzipSync } from "node:zlib";

const GZIP_MAGIC_PREFIX = "gz1:";

export type WorkerPayloadStatus = "ok" | "degraded" | null;
export type WorkerSlugStatus = "green" | "amber" | "red" | "missing";

export interface WorkerHealthStrictSummary {
  amber: number;
  red: number;
  missing: number;
  degradedPayload: number;
  emptyPayload: number;
}

export interface WorkerPayloadHealth {
  payloadStatus: WorkerPayloadStatus;
  dataAsOf: string | null;
  errorCount: number | null;
  rowCount: number | null;
}

export function decodeWorkerPayloadFromStore(raw: unknown): unknown {
  if (typeof raw === "object" && raw !== null) return raw;
  if (typeof raw !== "string") {
    throw new Error("worker payload is not a string or object");
  }
  const payload = raw.startsWith(GZIP_MAGIC_PREFIX)
    ? gunzipSync(Buffer.from(raw.slice(GZIP_MAGIC_PREFIX.length), "base64")).toString(
        "utf8",
      )
    : raw;
  return JSON.parse(payload) as unknown;
}

function countArrayRows(value: unknown): number | null {
  return Array.isArray(value) ? value.length : null;
}

function countObjectRows(value: unknown): number | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value).length
    : null;
}

function countTrendingRows(payload: unknown): number | null {
  const buckets = (payload as { buckets?: unknown })?.buckets;
  if (!buckets || typeof buckets !== "object") return null;
  let count = 0;
  for (const langMap of Object.values(buckets)) {
    if (!langMap || typeof langMap !== "object") continue;
    for (const rows of Object.values(langMap)) {
      if (Array.isArray(rows)) count += rows.length;
    }
  }
  return count;
}

function countCollectionRankingRows(payload: unknown): number | null {
  const collections = (payload as { collections?: unknown })?.collections;
  if (!collections || typeof collections !== "object") return null;
  let count = 0;
  for (const collection of Object.values(collections)) {
    if (!collection || typeof collection !== "object") continue;
    for (const rows of Object.values(collection)) {
      if (Array.isArray(rows)) count += rows.length;
    }
  }
  return count;
}

function countRows(slug: string, payload: unknown): number | null {
  if (slug === "hn-pulse") {
    return countArrayRows((payload as { stories?: unknown })?.stories);
  }
  if (slug === "trending") return countTrendingRows(payload);
  if (slug === "hot-collections") {
    return countArrayRows((payload as { rows?: unknown })?.rows);
  }
  if (slug === "recent-repos" || slug === "trendshift-daily" || slug === "manual-repos") {
    return countArrayRows((payload as { items?: unknown })?.items);
  }
  if (slug === "deltas") {
    return countObjectRows((payload as { repos?: unknown })?.repos);
  }
  if (slug === "repo-metadata" || slug === "consensus-trending") {
    return countArrayRows((payload as { items?: unknown })?.items);
  }
  if (slug === "repo-profiles") {
    return countObjectRows((payload as { profiles?: unknown })?.profiles);
  }
  if (slug === "engagement-composite") {
    return countArrayRows((payload as { items?: unknown })?.items);
  }
  if (slug === "trustmrr-startups") {
    return countArrayRows((payload as { startups?: unknown })?.startups);
  }
  if (slug === "revenue-overlays") {
    return countObjectRows((payload as { overlays?: unknown })?.overlays);
  }
  if (slug === "hackernews-trending" || slug === "lobsters-trending") {
    return countArrayRows((payload as { stories?: unknown })?.stories);
  }
  if (slug === "hackernews-repo-mentions" || slug === "bluesky-mentions" || slug === "lobsters-mentions") {
    return countObjectRows((payload as { mentions?: unknown })?.mentions);
  }
  if (slug === "bluesky-trending") {
    return countArrayRows((payload as { posts?: unknown })?.posts);
  }
  if (slug === "producthunt-launches") {
    return countArrayRows((payload as { launches?: unknown })?.launches);
  }
  if (slug === "npm-packages") {
    return countArrayRows((payload as { packages?: unknown })?.packages);
  }
  if (slug === "reddit-baselines") {
    return countObjectRows((payload as { baselines?: unknown })?.baselines);
  }
  if (slug === "revenue-benchmarks") {
    return countArrayRows((payload as { buckets?: unknown })?.buckets);
  }
  if (slug === "collection-rankings") {
    return countCollectionRankingRows(payload);
  }
  if (slug === "funding-news" || slug === "funding-news-crunchbase") {
    return countArrayRows((payload as { signals?: unknown })?.signals);
  }
  if (slug === "consensus-verdicts") {
    return countObjectRows((payload as { items?: unknown })?.items);
  }
  if (slug === "devto-mentions") {
    return countObjectRows((payload as { mentions?: unknown })?.mentions);
  }
  if (slug === "devto-trending") {
    return countArrayRows((payload as { articles?: unknown })?.articles);
  }
  if (slug === "twitter-repo-signals") {
    return countArrayRows((payload as { posts?: unknown })?.posts);
  }
  if (slug === "repo-registry" || slug === "star-activity-deltas") {
    return countObjectRows((payload as { repos?: unknown })?.repos);
  }
  if (slug === "mentions-ledger") {
    return countArrayRows((payload as { entries?: unknown })?.entries);
  }
  if (
    slug === "editorial-best" ||
    slug === "editorial-categories" ||
    slug === "editorial-compare" ||
    slug === "editorial-alternatives"
  ) {
    return countObjectRows((payload as { items?: unknown })?.items);
  }
  return null;
}

export function summarizeWorkerPayloadHealth(
  slug: string,
  payload: unknown,
): WorkerPayloadHealth {
  const envelope = payload as {
    status?: unknown;
    dataAsOf?: unknown;
    errors?: unknown;
  };
  return {
    payloadStatus:
      envelope.status === "ok" || envelope.status === "degraded"
        ? envelope.status
        : null,
    dataAsOf:
      typeof envelope.dataAsOf === "string"
        ? envelope.dataAsOf
        : typeof (payload as { fetchedAt?: unknown }).fetchedAt === "string"
          ? (payload as { fetchedAt: string }).fetchedAt
          : typeof (payload as { computedAt?: unknown }).computedAt === "string"
            ? (payload as { computedAt: string }).computedAt
            : typeof (payload as { writtenAt?: unknown }).writtenAt === "string"
              ? (payload as { writtenAt: string }).writtenAt
              : null,
    errorCount: Array.isArray(envelope.errors) ? envelope.errors.length : null,
    rowCount: countRows(slug, payload),
  };
}

export function applyPayloadHealthToSlugStatus(
  status: WorkerSlugStatus,
  payloadHealth: WorkerPayloadHealth | null,
): WorkerSlugStatus {
  if (!payloadHealth) return status;
  if (payloadHealth.rowCount === null || payloadHealth.rowCount === 0) return "red";
  if (payloadHealth.payloadStatus === "degraded" && status === "green") {
    return "amber";
  }
  return status;
}

export function isWorkerHealthStrictlyOk(
  summary: WorkerHealthStrictSummary,
): boolean {
  return (
    summary.amber === 0 &&
    summary.red === 0 &&
    summary.missing === 0 &&
    summary.degradedPayload === 0 &&
    summary.emptyPayload === 0
  );
}
