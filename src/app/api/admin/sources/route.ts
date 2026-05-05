import { NextRequest, NextResponse } from "next/server";

import { adminAuthFailureResponse, verifyAdminAuth } from "@/lib/api/auth";
import {
  GET as getFreshnessState,
  type FreshnessStateResponse,
  type SourceState as FreshnessSourceState,
} from "@/app/api/cron/freshness/state/route";
import { GET as getPoolState } from "@/app/api/admin/pool-state/route";
import { GET as getHealthSources } from "@/app/api/health/sources/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HealthSourcesDetail = { sources?: Record<string, { errorRate?: number }> };

type PoolStateLite = {
  github?: {
    rows?: Array<{ lastRateLimitRemaining?: number | null }>;
  };
};

export interface AdminSourceRow {
  source: string;
  last_success_at: string | null;
  age_ms: number | null;
  freshness_budget: string;
  error_rate_24h: number | null;
  rate_limit_remaining: number | null;
  status: "GREEN" | "YELLOW" | "RED";
}

export interface AdminSourcesResponse {
  ok: true;
  generatedAt: string;
  health: FreshnessStateResponse["health"];
  rows: AdminSourceRow[];
}

interface ErrorResponse {
  ok: false;
  error: string;
}

const SOURCE_BINDINGS: Array<{
  source: string;
  freshness: string;
  breaker?: string;
  rateLimitFrom?: "github_pool_avg";
}> = [
  { source: "GitHub", freshness: "trending-repos", rateLimitFrom: "github_pool_avg" },
  { source: "Reddit", freshness: "reddit", breaker: "reddit" },
  { source: "Twitter", freshness: "twitter", breaker: "apify" },
  { source: "Hacker News", freshness: "hackernews", breaker: "hackernews" },
  { source: "ProductHunt", freshness: "producthunt", breaker: "producthunt" },
  { source: "Bluesky", freshness: "bluesky", breaker: "bluesky" },
  { source: "dev.to", freshness: "devto", breaker: "devto" },
  { source: "Lobsters", freshness: "lobsters", breaker: "lobsters" },
  { source: "arXiv", freshness: "arxiv", breaker: "arxiv" },
  { source: "HuggingFace models", freshness: "huggingface", breaker: "huggingface" },
  { source: "HuggingFace datasets", freshness: "huggingface-datasets", breaker: "huggingface" },
  { source: "npm", freshness: "npm", breaker: "npm" },
  { source: "PyPI", freshness: "mcp-downloads" },
  { source: "OSS Insight", freshness: "trending-repos", breaker: "ossinsight" },
  { source: "Crunchbase funding", freshness: "funding-crunchbase", breaker: "firecrawl" },
  { source: "TrustMRR", freshness: "revenue", breaker: "trustmrr" },
  { source: "Anthropic RSS", freshness: "claude-rss" },
  { source: "OpenAI RSS", freshness: "openai-rss" },
];

function toDisplayStatus(
  freshness: FreshnessSourceState["status"] | null,
  errorRate: number | null,
): "GREEN" | "YELLOW" | "RED" {
  const mapped =
    freshness === "RED" || freshness === "DEAD"
      ? "RED"
      : freshness === "YELLOW"
        ? "YELLOW"
        : "GREEN";
  if ((errorRate ?? 0) > 0.2) return "RED";
  return mapped;
}

function sortRank(status: AdminSourceRow["status"]): number {
  if (status === "RED") return 0;
  if (status === "YELLOW") return 1;
  return 2;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<AdminSourcesResponse | ErrorResponse>> {
  const deny = adminAuthFailureResponse(verifyAdminAuth(request));
  if (deny) return deny as NextResponse<ErrorResponse>;

  const cookie = request.headers.get("cookie") ?? "";
  const cronSecret = process.env.CRON_SECRET?.trim() ?? "";

  const [freshnessRes, healthRes, poolRes] = await Promise.all([
    getFreshnessState(
      new NextRequest("http://localhost/api/cron/freshness/state", {
        headers: cronSecret ? { authorization: `Bearer ${cronSecret}` } : {},
      }),
    ),
    getHealthSources(
      new NextRequest("http://localhost/api/health/sources?detail=1", {
        headers: {
          cookie,
          ...(cronSecret ? { authorization: `Bearer ${cronSecret}` } : {}),
        },
      }),
    ),
    getPoolState(
      new NextRequest("http://localhost/api/admin/pool-state", {
        headers: { cookie },
      }),
    ),
  ]);

  if (!freshnessRes.ok) {
    return NextResponse.json(
      { ok: false, error: "freshness state unavailable" },
      { status: 503 },
    );
  }

  const freshness = (await freshnessRes.json()) as FreshnessStateResponse;
  const health = healthRes.ok
    ? ((await healthRes.json()) as HealthSourcesDetail)
    : ({ sources: {} } as HealthSourcesDetail);
  const pool = (await poolRes.json()) as PoolStateLite;

  const freshnessMap = new Map<string, FreshnessSourceState>();
  for (const source of freshness.sources) freshnessMap.set(source.name, source);

  const githubPoolValues =
    pool.github?.rows
      ?.map((row) => row.lastRateLimitRemaining)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value)) ?? [];
  const githubRateLimitAvg = avg(githubPoolValues);

  const rows: AdminSourceRow[] = SOURCE_BINDINGS.map((binding) => {
    const freshnessRow = freshnessMap.get(binding.freshness) ?? null;
    const errorRate =
      binding.breaker && health.sources?.[binding.breaker]
        ? (health.sources[binding.breaker].errorRate ?? null)
        : null;
    const status = toDisplayStatus(freshnessRow?.status ?? null, errorRate);
    return {
      source: binding.source,
      last_success_at: freshnessRow?.lastUpdate ?? null,
      age_ms: freshnessRow?.ageMs ?? null,
      freshness_budget: freshnessRow?.freshnessBudget ?? "-",
      error_rate_24h: errorRate,
      rate_limit_remaining:
        binding.rateLimitFrom === "github_pool_avg" ? githubRateLimitAvg : null,
      status,
    };
  }).sort((a, b) => {
    const byStatus = sortRank(a.status) - sortRank(b.status);
    if (byStatus !== 0) return byStatus;
    const byAge = (b.age_ms ?? -1) - (a.age_ms ?? -1);
    if (byAge !== 0) return byAge;
    return a.source.localeCompare(b.source);
  });

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    health: freshness.health,
    rows,
  });
}
