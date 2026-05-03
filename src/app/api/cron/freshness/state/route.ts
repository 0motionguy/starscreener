// GET /api/cron/freshness/state
//
// Operator-facing freshness inventory for the session-opening gate. Reads the
// per-source sidecars in data/_meta plus data-store last-write timestamps
// (Redis primary, bundled file fallback) and returns one stable JSON envelope.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { NextRequest, NextResponse } from "next/server";

import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import { getDataStore } from "@/lib/data-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SourceStatus = "GREEN" | "YELLOW" | "RED" | "DEAD";

interface SourceSpec {
  name: string;
  metaSource?: string;
  redisSlugs: string[];
  budgetMs: number;
  budgetLabel: string;
}

interface SourceState {
  name: string;
  lastUpdate: string | null;
  freshnessBudget: string;
  ageMs: number | null;
  status: SourceStatus;
}

interface FreshnessStateResponse {
  checkedAt: string;
  sources: SourceState[];
  summary: {
    green: number;
    yellow: number;
    red: number;
    dead: number;
  };
}

interface SourceMeta {
  reason?: string;
  ts?: string;
  writtenAt?: string;
}

interface TimestampProbe {
  timestamp: string | null;
  status: SourceStatus;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function hours(n: number): { budgetMs: number; budgetLabel: string } {
  return { budgetMs: n * HOUR_MS, budgetLabel: `${n}h` };
}

const SOURCE_SPECS: ReadonlyArray<SourceSpec> = [
  {
    name: "trending-repos",
    metaSource: "trending",
    redisSlugs: ["trending"],
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
    name: "collection-rankings",
    redisSlugs: ["collection-rankings"],
    ...hours(12),
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
      timestamp,
      status: timestamp ? metaStatus(meta) : "DEAD",
    };
  } catch {
    return { timestamp: null, status: "DEAD" };
  }
}

async function readStoreProbe(slug: string): Promise<TimestampProbe> {
  try {
    const timestamp = parseIso(await getDataStore().writtenAt(slug));
    return {
      timestamp,
      status: timestamp ? "GREEN" : "DEAD",
    };
  } catch {
    return { timestamp: null, status: "DEAD" };
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
  const probes = await Promise.all([
    spec.metaSource
      ? readMetaProbe(spec.metaSource)
      : Promise.resolve<TimestampProbe>({ timestamp: null, status: "GREEN" }),
    ...spec.redisSlugs.map((slug) => readStoreProbe(slug)),
  ]);
  // Use the oldest required timestamp so a fresh sibling artifact cannot mask
  // a stale or missing payload under the same source group.
  const lastUpdate = oldestIso(probes.map((probe) => probe.timestamp));
  const ageMs = lastUpdate
    ? Math.max(0, nowMs - Date.parse(lastUpdate))
    : null;
  const status = maxStatus(
    classify(ageMs, spec.budgetMs),
    ...probes.map((probe) => probe.status),
  );

  return {
    name: spec.name,
    lastUpdate,
    freshnessBudget: spec.budgetLabel,
    ageMs,
    status,
  };
}

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
): Promise<NextResponse<FreshnessStateResponse | { ok: false; reason: string }>> {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) {
    return deny as NextResponse<{ ok: false; reason: string }>;
  }

  const nowMs = Date.now();
  const sources = await Promise.all(
    SOURCE_SPECS.map((spec) => inspectSource(spec, nowMs)),
  );
  sources.sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({
    checkedAt: new Date(nowMs).toISOString(),
    sources,
    summary: summarize(sources),
  });
}
