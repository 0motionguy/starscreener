// GET /api/cron/freshness/state
//
// Operator-facing freshness inventory for the session-opening gate. Reads the
// per-source sidecars in data/_meta plus data-store last-write timestamps
// (Redis primary, bundled file fallback) and returns one stable JSON envelope.

import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { NextRequest, NextResponse } from "next/server";

import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import {
  type ApiErrorEnvelope,
  serverError,
} from "@/lib/api/error-response";
import { getDataStore } from "@/lib/data-store";
import { OpsAlertFatalError } from "@/lib/errors";
import { deriveHealth, type FreshnessHealth } from "@/lib/freshness-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SourceStatus = "GREEN" | "YELLOW" | "RED" | "DEAD";

interface SourceSpec {
  name: string;
  metaSource?: string;
  redisSlugs?: string[];
  redisGroupMode?: "all" | "any";
  redisSlugGroups?: Array<{
    label: string;
    slugs: (nowMs: number) => string[];
  }>;
  blocking?: boolean;
  budgetMs: number;
  budgetLabel: string;
}

interface SourceState {
  name: string;
  lastUpdate: string | null;
  lastWriter: string | null;
  lastWriterRunId: string | null;
  lastWriterCommit: string | null;
  freshnessBudget: string;
  ageMs: number | null;
  status: SourceStatus;
  blocking: boolean;
}

interface FreshnessStateResponse {
  checkedAt: string;
  health: FreshnessHealth;
  sources: SourceState[];
  summary: {
    green: number;
    yellow: number;
    red: number;
    dead: number;
  };
}

type FreshnessStateErrorResponse = ApiErrorEnvelope;

interface SourceMeta {
  reason?: string;
  ts?: string;
  writtenAt?: string;
}

interface TimestampProbe {
  slug: string | null;
  timestamp: string | null;
  status: SourceStatus;
  writer: string | null;
  runId: string | null;
  commit: string | null;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function hours(n: number): { budgetMs: number; budgetLabel: string } {
  return { budgetMs: n * HOUR_MS, budgetLabel: `${n}h` };
}

function days(n: number): { budgetMs: number; budgetLabel: string } {
  return { budgetMs: n * DAY_MS, budgetLabel: `${n}d` };
}

function utcDateDaysAgo(nowMs: number, daysAgo: number): string {
  return new Date(nowMs - daysAgo * DAY_MS).toISOString().slice(0, 10);
}

function todayOrYesterdaySlug(prefix: string): (nowMs: number) => string[] {
  return (nowMs) => [
    `${prefix}:${utcDateDaysAgo(nowMs, 0)}`,
    `${prefix}:${utcDateDaysAgo(nowMs, 1)}`,
  ];
}

function hotnessSnapshotSlugs(domain: string): (nowMs: number) => string[] {
  return (nowMs) => [
    `hotness-snapshot:${domain}:${utcDateDaysAgo(nowMs, 0)}`,
    `hotness-snapshot:${domain}:${utcDateDaysAgo(nowMs, 1)}`,
  ];
}

const SOURCE_SPECS: ReadonlyArray<SourceSpec> = [
  {
    name: "trending-repos",
    metaSource: "trending",
    redisSlugs: ["trending", "trending-lite"],
    ...hours(6),
  },
  {
    name: "deltas",
    redisSlugs: ["deltas"],
    ...hours(6),
  },
  {
    name: "hot-collections",
    redisSlugs: ["hot-collections"],
    ...hours(6),
  },
  {
    name: "recent-repos",
    redisSlugs: ["recent-repos"],
    ...hours(6),
  },
  {
    name: "repo-metadata",
    redisSlugs: ["repo-metadata"],
    ...hours(6),
  },
  {
    name: "repo-profiles",
    redisSlugs: ["repo-profiles"],
    ...hours(6),
  },
  {
    name: "hackernews",
    metaSource: "hackernews",
    redisSlugs: ["hackernews-trending", "hackernews-repo-mentions"],
    ...hours(6),
  },
  {
    name: "reddit",
    metaSource: "reddit",
    redisSlugs: ["reddit-mentions", "reddit-all-posts"],
    ...hours(6),
  },
  {
    name: "reddit-baselines",
    redisSlugs: ["reddit-baselines"],
    ...days(8),
  },
  {
    name: "bluesky",
    metaSource: "bluesky",
    redisSlugs: ["bluesky-trending", "bluesky-mentions"],
    ...hours(6),
  },
  {
    name: "lobsters",
    metaSource: "lobsters",
    redisSlugs: ["lobsters-trending", "lobsters-mentions"],
    ...hours(12),
  },
  {
    name: "devto",
    metaSource: "devto",
    redisSlugs: ["devto-trending", "devto-mentions"],
    ...hours(24),
  },
  {
    name: "producthunt",
    metaSource: "producthunt",
    redisSlugs: ["producthunt-launches"],
    ...hours(12),
  },
  {
    name: "twitter",
    redisSlugs: ["twitter-trending"],
    ...hours(12),
  },
  {
    name: "arxiv",
    metaSource: "arxiv",
    redisSlugs: ["arxiv-recent", "arxiv-enriched"],
    ...hours(24),
  },
  {
    name: "huggingface",
    metaSource: "huggingface",
    redisSlugs: ["huggingface-trending"],
    ...hours(24),
  },
  {
    name: "huggingface-datasets",
    metaSource: "huggingface-datasets",
    redisSlugs: ["huggingface-datasets"],
    ...hours(24),
  },
  {
    name: "huggingface-spaces",
    metaSource: "huggingface-spaces",
    redisSlugs: ["huggingface-spaces"],
    ...hours(24),
  },
  {
    name: "npm",
    metaSource: "npm",
    redisSlugs: ["npm-packages"],
    ...hours(24),
  },
  {
    name: "funding-news",
    metaSource: "funding-news",
    redisSlugs: ["funding-news"],
    ...hours(24),
  },
  {
    name: "funding-x",
    redisSlugs: ["funding-news-x"],
    ...hours(24),
  },
  {
    name: "funding-crunchbase",
    redisSlugs: ["funding-news-crunchbase"],
    ...hours(24),
  },
  {
    name: "revenue",
    redisSlugs: ["trustmrr-startups", "revenue-overlays"],
    ...hours(36),
  },
  {
    name: "revenue-benchmarks",
    redisSlugs: ["revenue-benchmarks"],
    ...hours(24),
  },
  {
    name: "revenue-manual-matches",
    redisSlugs: ["revenue-manual-matches"],
    ...days(7),
  },
  {
    name: "collection-rankings",
    redisSlugs: ["collection-rankings"],
    ...hours(12),
  },
  {
    name: "trending-mcp",
    redisSlugs: ["trending-mcp"],
    ...hours(24),
  },
  {
    name: "mcp-liveness",
    redisSlugs: ["mcp-liveness"],
    ...hours(12),
  },
  {
    name: "mcp-downloads",
    redisSlugs: ["mcp-downloads", "mcp-downloads-pypi"],
    redisGroupMode: "any",
    ...hours(12),
  },
  {
    name: "mcp-dependents",
    redisSlugs: ["mcp-dependents"],
    blocking: false,
    ...hours(12),
  },
  {
    name: "mcp-smithery-rank",
    redisSlugs: ["mcp-smithery-rank"],
    blocking: false,
    ...hours(12),
  },
  {
    name: "mcp-usage-snapshot",
    redisSlugGroups: [
      {
        label: "mcp-usage-snapshot",
        slugs: todayOrYesterdaySlug("mcp-usage-snapshot"),
      },
    ],
    ...hours(36),
  },
  {
    name: "trending-skills",
    redisSlugs: [
      "trending-skill",
      "trending-skill-sh",
      "trending-skill-skillsmp",
      "trending-skill-smithery",
      "trending-skill-lobehub",
    ],
    ...hours(36),
  },
  {
    name: "skill-sidechannels",
    redisSlugs: ["awesome-skills", "skill-derivative-count"],
    ...hours(36),
  },
  {
    name: "skill-install-snapshots",
    redisSlugs: [
      "skill-install-snapshot:prev:1d",
      "skill-install-snapshot:prev:7d",
      "skill-install-snapshot:prev:30d",
    ],
    blocking: false,
    ...hours(36),
  },
  {
    name: "hotness-snapshots",
    redisSlugGroups: [
      {
        label: "hotness-snapshot:trending-skill",
        slugs: hotnessSnapshotSlugs("trending-skill"),
      },
      {
        label: "hotness-snapshot:trending-skill-sh",
        slugs: hotnessSnapshotSlugs("trending-skill-sh"),
      },
      {
        label: "hotness-snapshot:trending-mcp",
        slugs: hotnessSnapshotSlugs("trending-mcp"),
      },
    ],
    blocking: false,
    ...hours(36),
  },
  {
    name: "star-snapshots",
    redisSlugs: [
      "star-snapshot:24h",
      "star-snapshot:7d",
      "star-snapshot:30d",
      "star-snapshot:hourly-history",
    ],
    ...hours(6),
  },
  {
    name: "category-metrics",
    redisSlugs: [
      "category-metrics-snapshot:24h",
      "category-metrics-snapshot:7d",
      "category-metrics-snapshot:30d",
      "category-metrics-snapshot:hourly-history",
    ],
    ...hours(6),
  },
  {
    name: "top10-snapshot",
    redisSlugGroups: [
      {
        label: "top10",
        slugs: todayOrYesterdaySlug("top10"),
      },
    ],
    ...hours(36),
  },
  {
    name: "consensus",
    redisSlugs: ["consensus-trending", "consensus-verdicts"],
    ...hours(36),
  },
  {
    name: "model-usage",
    redisSlugs: ["llm-aggregate-heartbeat", "llm-model-metadata"],
    blocking: false,
    ...hours(36),
  },
  {
    name: "agent-commerce",
    redisSlugs: ["agent-commerce"],
    ...hours(36),
  },
  {
    name: "engagement-composite",
    redisSlugs: ["engagement-composite"],
    ...hours(24),
  },
  {
    name: "trendshift-daily",
    redisSlugs: ["trendshift-daily"],
    ...hours(36),
  },
  {
    name: "scoring-shadow",
    redisSlugs: ["scoring-shadow-report"],
    ...hours(36),
  },
  {
    name: "staleness-report",
    redisSlugs: ["staleness-report"],
    ...hours(36),
  },
  {
    name: "unknown-mentions",
    redisSlugs: ["unknown-mentions-promoted"],
    ...hours(36),
  },
  {
    name: "claude-rss",
    metaSource: "claude-rss",
    redisSlugs: ["claude-rss"],
    ...hours(30),
  },
  {
    name: "openai-rss",
    metaSource: "openai-rss",
    redisSlugs: ["openai-rss"],
    ...hours(30),
  },
  {
    name: "awesome-skills",
    metaSource: "awesome-skills",
    redisSlugs: ["awesome-skills"],
    ...hours(30),
  },
];

function parseIso(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  const ms = Date.parse(candidate);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function metaStatus(meta: SourceMeta): SourceStatus {
  if (meta.reason === "ok" || meta.reason === "empty_results") return "GREEN";
  if (meta.reason === "partial") return "YELLOW";
  return "RED";
}

async function readMetaProbe(source: string): Promise<TimestampProbe> {
  try {
    const raw = await readFile(
      resolve(process.cwd(), "data", "_meta", `${source}.json`),
      "utf8",
    );
    const meta = JSON.parse(raw) as SourceMeta;
    const timestamp = parseIso(meta.ts ?? meta.writtenAt);
    return {
      slug: null,
      timestamp,
      status: timestamp ? metaStatus(meta) : "DEAD",
      writer: null,
      runId: null,
      commit: null,
    };
  } catch {
    return {
      slug: null,
      timestamp: null,
      status: "DEAD",
      writer: null,
      runId: null,
      commit: null,
    };
  }
}

function parseWriterMeta(raw: unknown): {
  writer: string | null;
  runId: string | null;
  commit: string | null;
} {
  if (raw === null || raw === undefined) {
    return { writer: null, runId: null, commit: null };
  }
  let obj: Record<string, unknown> | null = null;
  if (typeof raw === "string") {
    if (raw.startsWith("{")) {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        obj = parsed;
      } catch {
        obj = null;
      }
    }
  } else if (typeof raw === "object") {
    obj = raw as Record<string, unknown>;
  }
  if (!obj) return { writer: null, runId: null, commit: null };
  return {
    writer: typeof obj.writer === "string" ? obj.writer : null,
    runId: typeof obj.runId === "string" ? obj.runId : null,
    commit: typeof obj.commit === "string" ? obj.commit : null,
  };
}

async function readStoreProbe(slug: string): Promise<TimestampProbe> {
  const store = getDataStore();
  try {
    const [rawMeta, timestampRaw] = await Promise.all([
      store.redisClient()?.get(`ss:meta:v1:${slug}`) ?? null,
      store.writtenAt(slug),
    ]);
    const timestamp = parseIso(timestampRaw);
    const writerMeta = parseWriterMeta(rawMeta);
    if (!timestamp) {
      const fallbackTimestamp = await readPayloadFileTimestamp(slug);
      return {
        slug,
        timestamp: fallbackTimestamp,
        status: fallbackTimestamp ? "GREEN" : "DEAD",
        writer: writerMeta.writer,
        runId: writerMeta.runId,
        commit: writerMeta.commit,
      };
    }
    return {
      slug,
      timestamp,
      status: "GREEN",
      writer: writerMeta.writer,
      runId: writerMeta.runId,
      commit: writerMeta.commit,
    };
  } catch {
    const fallbackTimestamp = await readPayloadFileTimestamp(slug);
    return {
      slug,
      timestamp: fallbackTimestamp,
      status: fallbackTimestamp ? "GREEN" : "DEAD",
      writer: null,
      runId: null,
      commit: null,
    };
  }
}

async function readBestStoreProbe(slugs: string[]): Promise<TimestampProbe> {
  const probes = await Promise.all(slugs.map((slug) => readStoreProbe(slug)));
  let best: TimestampProbe | null = null;
  let bestMs = -Infinity;
  for (const probe of probes) {
    const ms = probe.timestamp ? Date.parse(probe.timestamp) : NaN;
    if (Number.isFinite(ms) && ms > bestMs) {
      best = probe;
      bestMs = ms;
    }
  }
  return (
    best ?? {
      slug: null,
      timestamp: null,
      status: "DEAD",
      writer: null,
      runId: null,
      commit: null,
    }
  );
}

async function readPayloadFileTimestamp(slug: string): Promise<string | null> {
  try {
    const snapshot = await stat(resolve(process.cwd(), "data", `${slug}.json`));
    return new Date(snapshot.mtimeMs).toISOString();
  } catch {
    return null;
  }
}

function oldestIso(candidates: Array<string | null>): string | null {
  let oldest: string | null = null;
  let oldestMs = Infinity;
  for (const candidate of candidates) {
    const ms = candidate ? Date.parse(candidate) : NaN;
    if (Number.isFinite(ms) && ms < oldestMs) {
      oldest = new Date(ms).toISOString();
      oldestMs = ms;
    }
  }
  return oldest;
}

function classify(ageMs: number | null, budgetMs: number): SourceStatus {
  if (ageMs === null) return "DEAD";
  if (ageMs > budgetMs + DAY_MS) return "DEAD";
  if (ageMs > budgetMs * 2) return "RED";
  if (ageMs > budgetMs) return "YELLOW";
  return "GREEN";
}

function maxStatus(...statuses: SourceStatus[]): SourceStatus {
  const rank: Record<SourceStatus, number> = {
    GREEN: 0,
    YELLOW: 1,
    RED: 2,
    DEAD: 3,
  };
  return statuses.reduce((worst, status) =>
    rank[status] > rank[worst] ? status : worst,
  );
}

async function inspectSource(spec: SourceSpec, nowMs: number): Promise<SourceState> {
  const probesAll = await Promise.all([
    spec.metaSource
      ? readMetaProbe(spec.metaSource)
      : Promise.resolve<TimestampProbe>({
          slug: null,
          timestamp: null,
          status: "GREEN",
          writer: null,
          runId: null,
          commit: null,
        }),
    ...(spec.redisSlugs ?? []).map((slug) => readStoreProbe(slug)),
    ...(spec.redisSlugGroups ?? []).map((group) =>
      readBestStoreProbe(group.slugs(nowMs)),
    ),
  ]);
  const probes =
    spec.redisGroupMode === "any"
      ? probesAll.filter((probe) => probe.status !== "DEAD")
      : probesAll;
  const effectiveProbes = probes.length > 0 ? probes : probesAll;
  // Use the oldest required timestamp so a fresh sibling artifact cannot mask
  // a stale or missing payload under the same source group.
  const lastUpdate = oldestIso(effectiveProbes.map((probe) => probe.timestamp));
  const ageMs = lastUpdate
    ? Math.max(0, nowMs - Date.parse(lastUpdate))
    : null;
  const provenanceProbe =
    effectiveProbes
      .filter((probe) => probe.timestamp)
      .sort((a, b) => Date.parse(b.timestamp ?? "") - Date.parse(a.timestamp ?? ""))[0] ??
    null;
  const status = maxStatus(
    classify(ageMs, spec.budgetMs),
    ...effectiveProbes.map((probe) => probe.status),
  );

  return {
    name: spec.name,
    lastUpdate,
    lastWriter: provenanceProbe?.writer ?? null,
    lastWriterRunId: provenanceProbe?.runId ?? null,
    lastWriterCommit: provenanceProbe?.commit ?? null,
    freshnessBudget: spec.budgetLabel,
    ageMs,
    status,
    blocking: spec.blocking !== false,
  };
}

// Test seam moved to ./_test-hooks.ts (Next.js app-router type validator
// rejects non-route exports from this file). resolveInspectSource is called
// at handler-time so test overrides registered after module import still apply.
import { resolveInspectSource } from "./_test-hooks";

function summarize(sources: SourceState[]): FreshnessStateResponse["summary"] {
  return {
    green: sources.filter((source) => source.status === "GREEN").length,
    yellow: sources.filter((source) => source.status === "YELLOW").length,
    red: sources.filter((source) => source.status === "RED").length,
    dead: sources.filter((source) => source.status === "DEAD").length,
  };
}

export async function GET(
  request: NextRequest,
): Promise<
  NextResponse<
    FreshnessStateResponse | { ok: false; reason: string } | FreshnessStateErrorResponse
  >
> {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) {
    return deny as NextResponse<{ ok: false; reason: string }>;
  }
  try {
    const nowMs = Date.now();
    const sources = await Promise.all(
      SOURCE_SPECS.map((spec) => resolveInspectSource(inspectSource)(spec, nowMs)),
    );
    sources.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      checkedAt: new Date(nowMs).toISOString(),
      health: deriveHealth(sources),
      sources,
      summary: summarize(sources),
    });
  } catch (error) {
    const typedError =
      error instanceof Error
        ? new OpsAlertFatalError(
            "freshness state route failed",
            { route: "/api/cron/freshness/state" },
          )
        : error;
    return serverError<FreshnessStateErrorResponse>(typedError, {
      scope: "[cron/freshness-state]",
      code: "FRESHNESS_STATE_FAILED",
      publicMessage: "freshness state unavailable",
      status: 500,
    });
  }
}

