// Base on-chain x402 settlements loader.
//
// Reads .data/base-x402-onchain.json (produced by scripts/fetch-base-x402-onchain.mjs)
// and exposes typed getters for the /agent-commerce page.
//
// Phase 4 (data-API): Redis is the live source of truth. The bundled
// .data/base-x402-onchain.json is the cold-start seed. Server components call
// `refreshBaseX402OnchainFromStore()` once before reading any sync getter;
// 30s rate-limit + in-flight dedupe so concurrent renders don't fan out.
//
// Note: file lives under .data/ (not data/), so the data-store's built-in
// file fallback (which looks in data/) won't see it. We do the .data/ fallback
// here explicitly. Slug "base-x402-onchain" is reserved for when the writer
// wires writeDataStore().

import { readFileSync } from "fs";
import { resolve } from "path";

const SLUG = "base-x402-onchain";
const FILE_PATH = resolve(process.cwd(), ".data", `${SLUG}.json`);

export interface BaseX402OnchainFile {
  fetchedAt?: string;
  totalSettlements?: number;
  byFacilitator?: Record<
    string,
    { addressCount: number; totalTxs: number; x402Settlements: number }
  >;
  byDay?: Record<
    string,
    { txs: number; byFacilitator: Record<string, number> }
  >;
  samples?: Array<{
    facilitator: string;
    txHash: string;
    from?: string;
    timestamp: string;
    blockNumber?: number;
  }>;
}

let cached: BaseX402OnchainFile | null = null;

function readFromFile(): BaseX402OnchainFile | null {
  try {
    const raw = readFileSync(FILE_PATH, "utf8");
    return JSON.parse(raw) as BaseX402OnchainFile;
  } catch {
    return null;
  }
}

export function getBaseX402Onchain(): BaseX402OnchainFile | null {
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

export async function refreshBaseX402OnchainFromStore(): Promise<RefreshResult> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) {
    return { source: "memory", ageMs: sinceLast };
  }

  inflight = (async (): Promise<RefreshResult> => {
    try {
      const { getDataStore } = await import("./data-store");
      const store = getDataStore();
      const result = await store.read<BaseX402OnchainFile>(SLUG);
      if (result.data && result.source !== "missing") {
        cached = result.data;
        lastRefreshMs = Date.now();
        return { source: result.source, ageMs: result.ageMs };
      }
    } catch {
      // fall through to file fallback
    }
    // Redis missed (or threw) — fall back to .data/<slug>.json on disk.
    const file = readFromFile();
    if (file) cached = file;
    lastRefreshMs = Date.now();
    return { source: file ? "file" : "missing", ageMs: 0 };
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

export function _resetBaseX402OnchainCacheForTests(): void {
  cached = null;
  lastRefreshMs = 0;
  inflight = null;
}
