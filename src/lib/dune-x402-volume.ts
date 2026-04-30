// Dune historical x402 volume loader.
//
// Reads .data/dune-x402-volume.json (produced by scripts/fetch-dune-x402.mjs)
// and exposes typed getters for the /agent-commerce page.
//
// Phase 4 (data-API): Redis is the live source of truth, .data/ file is the
// fallback. Slug "dune-x402-volume" reserved for when the writer wires
// writeDataStore().

import { readFileSync } from "fs";
import { resolve } from "path";

const SLUG = "dune-x402-volume";
const FILE_PATH = resolve(process.cwd(), ".data", `${SLUG}.json`);

export interface DuneX402VolumeFile {
  fetchedAt?: string;
  lastDay?: string | null;
  rows?: Array<{
    day: string;
    facilitator: string;
    txCount: number;
    volumeUsdc: string;
  }>;
}

let cached: DuneX402VolumeFile | null = null;

function readFromFile(): DuneX402VolumeFile | null {
  try {
    const raw = readFileSync(FILE_PATH, "utf8");
    return JSON.parse(raw) as DuneX402VolumeFile;
  } catch {
    return null;
  }
}

export function getDuneX402Volume(): DuneX402VolumeFile | null {
  if (cached) return cached;
  const file = readFromFile();
  if (file) cached = file;
  return cached;
}

interface RefreshResult {
  source: "redis" | "file" | "memory" | "missing";
  ageMs: number;
}

let inflight: Promise<RefreshResult> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

export async function refreshDuneX402VolumeFromStore(): Promise<RefreshResult> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) {
    return { source: "memory", ageMs: sinceLast };
  }

  inflight = (async (): Promise<RefreshResult> => {
    try {
      const { getDataStore } = await import("./data-store");
      const store = getDataStore();
      const result = await store.read<DuneX402VolumeFile>(SLUG);
      if (result.data && result.source !== "missing") {
        cached = result.data;
        lastRefreshMs = Date.now();
        return { source: result.source, ageMs: result.ageMs };
      }
    } catch {
      // fall through to file fallback
    }
    const file = readFromFile();
    if (file) cached = file;
    lastRefreshMs = Date.now();
    return { source: file ? "file" : "missing", ageMs: 0 };
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

export function _resetDuneX402VolumeCacheForTests(): void {
  cached = null;
  lastRefreshMs = 0;
  inflight = null;
}
