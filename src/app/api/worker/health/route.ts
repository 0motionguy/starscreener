// Worker fleet health probe.
//
// Reads the meta sidecar (`ss:meta:v1:<slug>`) for every active Redis slug the
// worker owns, computes age, classifies green / amber / red / missing against
// expected cadence, and returns one aggregated JSON envelope.

import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import {
  WORKER_HEALTH_DISABLED_SPECS,
  WORKER_HEALTH_SPECS,
  type DisabledSlugHealthSpec,
} from "@/lib/worker-health-specs";

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

type SlugStatus = "green" | "amber" | "red" | "missing";

interface SlugHealth {
  slug: string;
  fetcher: string;
  cadenceMin: number;
  blocking: boolean;
  status: SlugStatus;
  writtenAt: string | null;
  ageSec: number | null;
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
}

interface HealthResponse {
  ok: boolean;
  generatedAt: string;
  summary: HealthSummary;
  slugs: SlugHealth[];
  disabledSlugs: DisabledSlugHealthSpec[];
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
  const now = Date.now();

  const probes = await Promise.all(
    SLUG_TABLE.map(async (spec) => {
      const writtenAt = await store.writtenAt(spec.slug).catch(() => null);
      const ageSec =
        writtenAt !== null
          ? Math.max(0, Math.floor((now - new Date(writtenAt).getTime()) / 1000))
          : null;
      const status = classifyAge(ageSec, spec.cadenceMin, spec.slowMoving === true);
      return {
        slug: spec.slug,
        fetcher: spec.fetcher,
        cadenceMin: spec.cadenceMin,
        blocking: spec.blocking !== false,
        status,
        writtenAt,
        ageSec,
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

  const ok = summary.blockingRed === 0 && summary.blockingMissing === 0;

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
