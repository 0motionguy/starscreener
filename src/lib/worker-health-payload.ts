import { gunzipSync } from "node:zlib";

const GZIP_MAGIC_PREFIX = "gz1:";

export type WorkerPayloadStatus = "ok" | "degraded" | null;
export type WorkerSlugStatus = "green" | "amber" | "red" | "missing";

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
  if (slug === "trending") return countTrendingRows(payload);
  if (slug === "hot-collections") {
    return countArrayRows((payload as { rows?: unknown })?.rows);
  }
  if (slug === "collection-rankings") {
    return countCollectionRankingRows(payload);
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
    dataAsOf: typeof envelope.dataAsOf === "string" ? envelope.dataAsOf : null,
    errorCount: Array.isArray(envelope.errors) ? envelope.errors.length : null,
    rowCount: countRows(slug, payload),
  };
}

export function applyPayloadHealthToSlugStatus(
  status: WorkerSlugStatus,
  payloadHealth: WorkerPayloadHealth | null,
): WorkerSlugStatus {
  if (!payloadHealth) return status;
  if (payloadHealth.rowCount === 0) return "red";
  if (payloadHealth.payloadStatus === "degraded" && status === "green") {
    return "amber";
  }
  return status;
}
