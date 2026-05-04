/**
 * @internal
 * Per-repo Twitter signal sync reader. Consumed only by ./trending-tweets.ts
 * and re-exported through TwitterSignalBuilder.getTwitterSignalSync /
 * .getTwitterSignalsDataVersion in ./builder.ts. Cross-signal pipeline +
 * derived-repos decorators may continue to import via the builder; do not
 * add new direct importers from outside src/lib/twitter/.
 */
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import type { TwitterRepoSignal } from "./types";

const TWITTER_SIGNALS_PATH = resolve(
  process.cwd(),
  ".data",
  "twitter-repo-signals.jsonl",
);

interface TwitterSignalCache {
  signature: string;
  byLowerFullName: Map<string, TwitterRepoSignal>;
  all: TwitterRepoSignal[];
  fromRedis?: boolean;
}

let cache: TwitterSignalCache | null = null;

function getFileSignature(path: string): string {
  try {
    const stat = statSync(path);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "missing";
  }
}

function loadTwitterSignalsCache(): TwitterSignalCache {
  if (cache && cache.fromRedis) return cache;
  const signature = getFileSignature(TWITTER_SIGNALS_PATH);
  if (cache && cache.signature === signature) return cache;

  const byLowerFullName = new Map<string, TwitterRepoSignal>();
  const all: TwitterRepoSignal[] = [];

  try {
    const raw = readFileSync(TWITTER_SIGNALS_PATH, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const signal = JSON.parse(trimmed) as TwitterRepoSignal;
      if (!signal.githubFullName) continue;
      all.push(signal);
      byLowerFullName.set(signal.githubFullName.toLowerCase(), signal);
    }
  } catch {
    // Missing/empty Twitter signal files should behave like a quiet source.
  }

  cache = { signature, byLowerFullName, all };
  return cache;
}

export function getTwitterSignalsDataVersion(): string {
  return loadTwitterSignalsCache().signature;
}

export function getTwitterSignalSync(
  fullName: string,
): TwitterRepoSignal | null {
  if (!fullName) return null;
  return (
    loadTwitterSignalsCache().byLowerFullName.get(fullName.toLowerCase()) ??
    null
  );
}

export function getAllTwitterSignalsSync(): TwitterRepoSignal[] {
  return loadTwitterSignalsCache().all;
}

let inflight: Promise<{ source: string; ageMs: number }> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

export async function refreshTwitterSignalsFromStore(): Promise<{
  source: string;
  ageMs: number;
}> {
  if (inflight) return inflight;
  if (
    Date.now() - lastRefreshMs < MIN_REFRESH_INTERVAL_MS &&
    lastRefreshMs > 0
  ) {
    return { source: "memory", ageMs: Date.now() - lastRefreshMs };
  }
  inflight = (async () => {
    const { getDataStore } = await import("../data-store");
    const result = await getDataStore().read<unknown>("twitter-repo-signals");
    if (Array.isArray(result.data) && result.source !== "missing") {
      const byLowerFullName = new Map<string, TwitterRepoSignal>();
      const all: TwitterRepoSignal[] = [];
      for (const row of result.data) {
        if (!row || typeof row !== "object") continue;
        const signal = row as TwitterRepoSignal;
        if (!signal.githubFullName) continue;
        all.push(signal);
        byLowerFullName.set(signal.githubFullName.toLowerCase(), signal);
      }
      cache = {
        signature: `redis:${result.writtenAt ?? Date.now()}`,
        byLowerFullName,
        all,
        fromRedis: true,
      };
    }
    lastRefreshMs = Date.now();
    return { source: result.source, ageMs: result.ageMs };
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
