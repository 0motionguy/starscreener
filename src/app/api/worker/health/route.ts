// Worker fleet health probe.
//
// Reads the meta sidecar (`ss:meta:v1:<slug>`) for every active Redis slug the
// worker owns, computes age, classifies green / amber / red / missing against
// expected cadence, and returns one aggregated JSON envelope.

import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDataStore, type RedisClientLike } from "@/lib/data-store";
import {
  WORKER_HEALTH_DISABLED_SPECS,
  WORKER_PAYLOAD_HEALTH_SLUGS,
  WORKER_HEALTH_SPECS,
  type DisabledSlugHealthSpec,
} from "@/lib/worker-health-specs";
import {
  applyPayloadHealthToSlugStatus,
  decodeWorkerPayloadFromStore,
  isWorkerHealthStrictlyOk,
  summarizeWorkerPayloadHealth,
  type WorkerPayloadHealth,
} from "@/lib/worker-health-payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkOptionalBearer(request: NextRequest): NextResponse | null {
  const expected = process.env.WORKER_HEALTH_BEARER?.trim();
  if (!expected) return null;
  const header = request.headers.get("authorization")?.trim() ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }
  const supplied = header.slice(prefix.length);
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  const match = a.length === b.length && timingSafeEqual(a, b);
  if (!match) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }
  return null;
}

const SLUG_TABLE = WORKER_HEALTH_SPECS;
const DISABLED_SLUG_TABLE = WORKER_HEALTH_DISABLED_SPECS;
const DATA_STORE_META_NAMESPACE = "ss:meta:v1";
const DATA_STORE_PAYLOAD_NAMESPACE = "ss:data:v1";

type SlugStatus = "green" | "amber" | "red" | "missing";

interface SlugHealth {
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

interface HealthSummary {
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

interface HealthResponse {
  ok: boolean;
  generatedAt: string;
  summary: HealthSummary;
  slugs: SlugHealth[];
  disabledSlugs: DisabledSlugHealthSpec[];
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
): Promise<WorkerPayloadHealth | null> {
  if (!redis || !WORKER_PAYLOAD_HEALTH_SLUGS.has(slug)) return null;
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

export async function GET(
  request: NextRequest,
): Promise<NextResponse<HealthResponse> | NextResponse> {
  const deny = checkOptionalBearer(request);
  if (deny) return deny;

  const store = getDataStore();
  const redis = store.redisClient();
  const now = Date.now();

  const probes = await Promise.all(
    SLUG_TABLE.map(async (spec) => {
      const [writtenAt, payloadHealth] = await Promise.all([
        readRedisMetaWrittenAt(redis, spec.slug),
        readRedisPayloadHealth(redis, spec.slug),
      ]);
      const ageSec =
        writtenAt !== null
          ? Math.max(0, Math.floor((now - new Date(writtenAt).getTime()) / 1000))
          : null;
      const ageStatus = classifyAge(ageSec, spec.cadenceMin, spec.slowMoving === true);
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
    total: probes.length + DISABLED_SLUG_TABLE.length,
    active: probes.length,
    disabled: DISABLED_SLUG_TABLE.length,
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

  const ok = isWorkerHealthStrictlyOk(summary);

  return NextResponse.json(
    {
      ok,
      generatedAt: new Date().toISOString(),
      summary,
      slugs: probes,
      disabledSlugs: [...DISABLED_SLUG_TABLE],
    },
    {
      status: ok ? 200 : 503,
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}
