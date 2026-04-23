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
  const signature = getFileSignature(TWITTER_SIGNALS_PATH);
  if (cache && cache.signature === signature) return cache;

  const byLowerFullName = new Map<string, TwitterRepoSignal>();

  try {
    const raw = readFileSync(TWITTER_SIGNALS_PATH, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const signal = JSON.parse(trimmed) as TwitterRepoSignal;
      if (!signal.githubFullName) continue;
      byLowerFullName.set(signal.githubFullName.toLowerCase(), signal);
    }
  } catch {
    // Missing/empty Twitter signal files should behave like a quiet source.
  }

  cache = { signature, byLowerFullName };
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
