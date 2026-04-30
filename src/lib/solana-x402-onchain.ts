// Solana on-chain x402 settlements loader.
//
// Reads .data/solana-x402-onchain.json (produced by scripts/fetch-solana-x402-onchain.mjs)
// and exposes typed getters for the /agent-commerce page.
//
// Phase 4 (data-API): Redis is the live source of truth. The .data/ file is
// the fallback. Server components call `refreshSolanaX402OnchainFromStore()`
// once before reading any sync getter; 30s rate-limit + in-flight dedupe.
//
// Slug "solana-x402-onchain" matches what the writer (commit 73bcbb48) writes.

import { readFileSync } from "fs";
import { resolve } from "path";

const SLUG = "solana-x402-onchain";
const FILE_PATH = resolve(process.cwd(), ".data", `${SLUG}.json`);

export interface SolanaX402OnchainFile {
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
    txSig: string;
    from?: string | null;
    to?: string | null;
    blockTime: string | null;
    slot?: number | null;
  }>;
}

let cached: SolanaX402OnchainFile | null = null;

function readFromFile(): SolanaX402OnchainFile | null {
  try {
    const raw = readFileSync(FILE_PATH, "utf8");
    return JSON.parse(raw) as SolanaX402OnchainFile;
  } catch {
    return null;
  }
}

export function getSolanaX402Onchain(): SolanaX402OnchainFile | null {
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

export async function refreshSolanaX402OnchainFromStore(): Promise<RefreshResult> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) {
    return { source: "memory", ageMs: sinceLast };
  }

  inflight = (async (): Promise<RefreshResult> => {
    try {
      const { getDataStore } = await import("./data-store");
      const store = getDataStore();
      const result = await store.read<SolanaX402OnchainFile>(SLUG);
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

export function _resetSolanaX402OnchainCacheForTests(): void {
  cached = null;
  lastRefreshMs = 0;
  inflight = null;
}
