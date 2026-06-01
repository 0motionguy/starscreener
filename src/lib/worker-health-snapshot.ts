import "server-only";

import type { RedisClientLike } from "@/lib/data-store";
import {
  WORKER_HEALTH_DISABLED_SPECS,
  WORKER_PAYLOAD_HEALTH_SLUGS,
  WORKER_HEALTH_SPECS,
  type DisabledSlugHealthSpec,
  type SlugHealthSpec,
} from "@/lib/worker-health-specs";
import {
  applyPayloadHealthToSlugStatus,
  decodeWorkerPayloadFromStore,
  isWorkerHealthStrictlyOk,
  summarizeWorkerPayloadHealth,
  type WorkerPayloadHealth,
} from "@/lib/worker-health-payload";

const DATA_STORE_META_NAMESPACE = "ss:meta:v1";
const DATA_STORE_PAYLOAD_NAMESPACE = "ss:data:v1";

export type SlugStatus = "green" | "amber" | "red" | "missing";

export interface SlugHealth {
  slug: string;
  fetcher: string;
  cadenceMin: number;
  blocking: boolean;
  status: SlugStatus;
  writtenAt: string | null;
  ageSec: number | null;
  payloadStatus: WorkerPayloadHealth["payloadStatus"];
  payloadDataAsOf: string | null;
  payloadErrorCount: number | null;
  payloadRowCount: number | null;
}

export interface HealthSummary {
  total: number;
  active: number;
  disabled: number;
  green: number;
  amber: number;
  red: number;
  missing: number;
  blockingRed: number;
  blockingMissing: number;
  degradedPayload: number;
  emptyPayload: number;
}

export interface WorkerHealthSnapshot {
  ok: boolean;
  generatedAt: string;
  summary: HealthSummary;
  slugs: SlugHealth[];
  disabledSlugs: DisabledSlugHealthSpec[];
}

export interface ReadWorkerHealthSnapshotOptions {
  nowMs?: number;
  specs?: readonly SlugHealthSpec[];
  disabledSpecs?: readonly DisabledSlugHealthSpec[];
  payloadHealthSlugs?: ReadonlySet<string>;
}

function dataStoreMetaKey(slug: string): string {
  return `${DATA_STORE_META_NAMESPACE}:${slug}`;
}

function dataStorePayloadKey(slug: string): string {
  return `${DATA_STORE_PAYLOAD_NAMESPACE}:${slug}`;
}

function parseRedisWrittenAt(raw: unknown): string | null {
  const valid = (value: string): string | null =>
    Number.isFinite(Date.parse(value)) ? value : null;
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string" && raw.length > 0) {
    if (raw[0] === "{") {
      try {
        const parsed = JSON.parse(raw) as { writtenAt?: unknown };
        return typeof parsed.writtenAt === "string" &&
          parsed.writtenAt.length > 0
          ? valid(parsed.writtenAt)
          : null;
      } catch {
        return null;
      }
    }
    return valid(raw);
  }
  if (typeof raw === "object") {
    const parsed = raw as { writtenAt?: unknown };
    return typeof parsed.writtenAt === "string" && parsed.writtenAt.length > 0
      ? valid(parsed.writtenAt)
      : null;
  }
  return null;
}

async function readRedisMetaWrittenAt(
  redis: RedisClientLike | null,
  slug: string,
): Promise<string | null> {
  if (!redis) return null;
  try {
    return parseRedisWrittenAt(await redis.get(dataStoreMetaKey(slug)));
  } catch {
    return null;
  }
}

async function readRedisPayloadHealth(
  redis: RedisClientLike | null,
  slug: string,
  payloadHealthSlugs: ReadonlySet<string>,
): Promise<WorkerPayloadHealth | null> {
  if (!redis || !payloadHealthSlugs.has(slug)) return null;
  try {
    const raw = await redis.get(dataStorePayloadKey(slug));
    if (!raw) {
      return {
        payloadStatus: null,
        dataAsOf: null,
        errorCount: null,
        rowCount: 0,
      };
    }
    return summarizeWorkerPayloadHealth(
      slug,
      decodeWorkerPayloadFromStore(raw),
    );
  } catch {
    return {
      payloadStatus: null,
      dataAsOf: null,
      errorCount: null,
      rowCount: 0,
    };
  }
}

function classifyAge(
  ageSec: number | null,
  cadenceMin: number,
  slowMoving: boolean,
): SlugStatus {
  if (ageSec === null) return "missing";
  const cadenceSec = cadenceMin * 60;
  const greenMultiplier = slowMoving ? 1.5 : 2;
  const amberMultiplier = slowMoving ? 3 : 6;
  if (ageSec < cadenceSec * greenMultiplier) return "green";
  if (ageSec < cadenceSec * amberMultiplier) return "amber";
  return "red";
}

export async function readWorkerHealthSnapshot(
  redis: RedisClientLike | null,
  options: ReadWorkerHealthSnapshotOptions = {},
): Promise<WorkerHealthSnapshot> {
  const specs = options.specs ?? WORKER_HEALTH_SPECS;
  const disabledSpecs = options.disabledSpecs ?? WORKER_HEALTH_DISABLED_SPECS;
  const payloadHealthSlugs =
    options.payloadHealthSlugs ?? WORKER_PAYLOAD_HEALTH_SLUGS;
  const nowMs = options.nowMs ?? Date.now();

  const probes = await Promise.all(
    specs.map(async (spec) => {
      const [writtenAt, payloadHealth] = await Promise.all([
        readRedisMetaWrittenAt(redis, spec.slug),
        readRedisPayloadHealth(redis, spec.slug, payloadHealthSlugs),
      ]);
      const ageSec =
        writtenAt !== null
          ? Math.max(0, Math.floor((nowMs - new Date(writtenAt).getTime()) / 1000))
          : null;
      const ageStatus = classifyAge(
        ageSec,
        spec.cadenceMin,
        spec.slowMoving === true,
      );
      const status = applyPayloadHealthToSlugStatus(ageStatus, payloadHealth);
      return {
        slug: spec.slug,
        fetcher: spec.fetcher,
        cadenceMin: spec.cadenceMin,
        blocking: spec.blocking !== false,
        status,
        writtenAt,
        ageSec,
        payloadStatus: payloadHealth?.payloadStatus ?? null,
        payloadDataAsOf: payloadHealth?.dataAsOf ?? null,
        payloadErrorCount: payloadHealth?.errorCount ?? null,
        payloadRowCount: payloadHealth?.rowCount ?? null,
      } satisfies SlugHealth;
    }),
  );

  const summary: HealthSummary = {
    total: probes.length + disabledSpecs.length,
    active: probes.length,
    disabled: disabledSpecs.length,
    green: probes.filter((p) => p.status === "green").length,
    amber: probes.filter((p) => p.status === "amber").length,
    red: probes.filter((p) => p.status === "red").length,
    missing: probes.filter((p) => p.status === "missing").length,
    blockingRed: probes.filter((p) => p.blocking && p.status === "red").length,
    blockingMissing: probes.filter((p) => p.blocking && p.status === "missing").length,
    degradedPayload: probes.filter((p) => p.payloadStatus === "degraded").length,
    emptyPayload: probes.filter((p) => p.payloadRowCount === 0).length,
  };

  const statusRank: Record<SlugStatus, number> = {
    missing: 0,
    red: 1,
    amber: 2,
    green: 3,
  };
  probes.sort((a, b) => {
    if (statusRank[a.status] !== statusRank[b.status]) {
      return statusRank[a.status] - statusRank[b.status];
    }
    return a.slug.localeCompare(b.slug);
  });

  return {
    ok: isWorkerHealthStrictlyOk(summary),
    generatedAt: new Date(nowMs).toISOString(),
    summary,
    slugs: probes,
    disabledSlugs: [...disabledSpecs],
  };
}

export function workerHealthProblemSlugs(snapshot: WorkerHealthSnapshot): string[] {
  return snapshot.slugs
    .filter(
      (slug) =>
        slug.status !== "green" ||
        slug.payloadStatus === "degraded" ||
        slug.payloadRowCount === 0,
    )
    .map((slug) => slug.slug)
    .sort();
}
