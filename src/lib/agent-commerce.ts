// Agent Commerce loader.
//
// Reads data/agent-commerce.json (produced by the worker fetcher under
// apps/trendingrepo-worker/src/fetchers/agent-commerce/) and exposes typed
// getters for the /agent-commerce page.
//
// Live source of truth is Redis (via src/lib/data-store). Server components
// call refreshAgentCommerceFromStore() before any sync getter; that pulls
// the freshest payload into the in-memory cache and is rate-limited so
// concurrent renders don't fan out N Redis calls.
//
// Shape mirrors src/lib/funding-news.ts.

import { readFileSync, statSync } from "fs";
import { resolve } from "path";

import { buildAgentCommerceStats } from "./agent-commerce/extract";
import type {
  AgentCommerceFile,
  AgentCommerceItem,
  AgentCommerceStats,
} from "./agent-commerce/types";

const DATA_PATH = resolve(process.cwd(), "data", "agent-commerce.json");
const EPOCH_ZERO = "1970-01-01T00:00:00.000Z";

interface AgentCommerceCache {
  signature: string;
  file: AgentCommerceFile;
}

let cache: AgentCommerceCache | null = null;

function createFallbackFile(): AgentCommerceFile {
  return {
    fetchedAt: EPOCH_ZERO,
    source: "none",
    windowDays: 30,
    items: [],
  };
}

function getFileSignature(path: string): string {
  try {
    const stat = statSync(path);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "missing";
  }
}

function normalizeFile(input: unknown): AgentCommerceFile {
  if (!input || typeof input !== "object") return createFallbackFile();
  const file = input as Partial<AgentCommerceFile>;
  return {
    fetchedAt:
      typeof file.fetchedAt === "string" && file.fetchedAt.trim().length > 0
        ? file.fetchedAt
        : EPOCH_ZERO,
    source: typeof file.source === "string" ? file.source : "unknown",
    windowDays:
      typeof file.windowDays === "number" && Number.isFinite(file.windowDays)
        ? file.windowDays
        : 30,
    items: Array.isArray(file.items) ? (file.items as AgentCommerceItem[]) : [],
  };
}

function loadCache(): AgentCommerceCache {
  const signature = getFileSignature(DATA_PATH);
  if (cache && cache.signature === signature) return cache;

  let file = createFallbackFile();
  try {
    const raw = readFileSync(DATA_PATH, "utf8");
    file = normalizeFile(JSON.parse(raw));
  } catch {
    file = createFallbackFile();
  }

  cache = { signature, file };
  return cache;
}

export function getAgentCommerceFile(): AgentCommerceFile {
  return loadCache().file;
}

export function isAgentCommerceCold(
  file: AgentCommerceFile = getAgentCommerceFile(),
): boolean {
  return !file.fetchedAt || file.fetchedAt.startsWith("1970-");
}

export function getAgentCommerceFetchedAt(): string | null {
  const file = getAgentCommerceFile();
  return isAgentCommerceCold(file) ? null : file.fetchedAt;
}

export function getAgentCommerceItems(): AgentCommerceItem[] {
  return getAgentCommerceFile().items ?? [];
}

export function getAgentCommerceItem(
  slug: string,
): AgentCommerceItem | null {
  const target = slug.toLowerCase();
  for (const item of getAgentCommerceItems()) {
    if (item.slug.toLowerCase() === target) return item;
  }
  return null;
}

export function getAgentCommerceStats(): AgentCommerceStats {
  return buildAgentCommerceStats(getAgentCommerceItems());
}

// ---------------------------------------------------------------------------
// Refresh hook — pulls the freshest agent-commerce payload from the data-store.
// ---------------------------------------------------------------------------

interface RefreshResult {
  source: "redis" | "file" | "memory" | "missing";
  ageMs: number;
}

let inflight: Promise<RefreshResult> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

export async function refreshAgentCommerceFromStore(): Promise<RefreshResult> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) {
    return { source: "memory", ageMs: sinceLast };
  }

  inflight = (async (): Promise<RefreshResult> => {
    try {
      const { getDataStore } = await import("./data-store");
      const store = getDataStore();
      const result = await store.read<unknown>("agent-commerce");
      if (result.data && result.source !== "missing") {
        const next = normalizeFile(result.data);
        cache = {
          signature: `redis:${result.writtenAt ?? Date.now()}`,
          file: next,
        };
      }
      lastRefreshMs = Date.now();
      return { source: result.source, ageMs: result.ageMs };
    } catch {
      lastRefreshMs = Date.now();
      return { source: "missing", ageMs: 0 };
    }
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

export function _resetAgentCommerceCacheForTests(): void {
  cache = null;
  lastRefreshMs = 0;
  inflight = null;
}
