// Live x402 settlement fetcher — Base BlockScout v2.
//
// Hits each known x402 facilitator address on Base in parallel, harvests
// the most recent transactions, and aggregates into per-minute buckets
// for the last hour plus totals for the last 1h / 24h windows.
//
// Free, no auth. Server-side only. Failure on any single address falls
// silently to an empty list — partial data is honest data.
//
// Facilitator address list is the same one the daily collector
// scripts/fetch-base-x402-onchain.mjs uses, kept in sync by hand.

export interface LiveX402PerMinute {
  /** HH:MM in UTC. */
  minute: string;
  /** Tx count in that 60s window. */
  count: number;
  /** ISO timestamp of the bucket start. */
  bucketStartIso: string;
}

export interface LiveX402Snapshot {
  fetchedAt: string;
  /** Tx count across all facilitators in the last 60 minutes. */
  totalLastHour: number;
  /** Tx count across all facilitators in the last 24 hours. */
  totalLast24h: number;
  /** Tx count across all facilitators we observed (BlockScout returns up to 50 per addr). */
  totalObserved: number;
  /** 60 entries, oldest → newest, one per minute of the last hour. */
  perMinute: LiveX402PerMinute[];
  /** Total tx in last 60 minutes, per facilitator. */
  perFacilitatorLastHour: Record<string, number>;
  /** Latest tx hash + timestamp + facilitator, for the activity feed. */
  latestTxs: Array<{
    hash: string;
    timestamp: string;
    facilitator: string;
    address: string;
  }>;
  /** Whether at least one BlockScout call succeeded. */
  healthy: boolean;
  /** True when returned data is the last-good snapshot after a failed refresh. */
  stale?: boolean;
  /** Timestamp of the last healthy upstream-backed snapshot. */
  lastGoodAt?: string;
  /** Timestamp of the failed refresh attempt that caused a stale fallback. */
  attemptedAt?: string;
}

// Same address list as scripts/fetch-base-x402-onchain.mjs:19-50.
// When a new facilitator launches, add it here AND there.
const FACILITATORS: Record<string, string[]> = {
  Heurist: [
    "0xb578b7db22581507d62bdbeb85e06acd1be09e11",
    "0x021cc47adeca6673def958e324ca38023b80a5be",
    "0x3f61093f61817b29d9556d3b092e67746af8cdfd",
    "0x290d8b8edcafb25042725cb9e78bcac36b8865f8",
    "0x612d72dc8402bba997c61aa82ce718ea23b2df5d",
    "0x1fc230ee3c13d0d520d49360a967dbd1555c8326",
  ],
  Coinbase: [
    "0xdbdf3d8ed80f84c35d01c6c9f9271761bad90ba6",
    "0x9aae2b0d1b9dc55ac9bab9556f9a26cb64995fb9",
    "0x3a70788150c7645a21b95b7062ab1784d3cc2104",
    "0x708e57b6650a9a741ab39cae1969ea1d2d10eca1",
    "0xce82eeec8e98e443ec34fda3c3e999cbe4cb6ac2",
    "0x7f6d822467df2a85f792d4508c5722ade96be056",
  ],
  CodeNut: [
    "0x8d8fa42584a727488eeb0e29405ad794a105bb9b",
    "0x87af99356d774312b73018b3b6562e1ae0e018c9",
    "0x65058cf664d0d07f68b663b0d4b4f12a5e331a38",
    "0x88e13d4c764a6c840ce722a0a3765f55a85b327e",
  ],
  Thirdweb: [
    "0x80c08de1a05df2bd633cf520754e40fde3c794d3",
    "0xaaca1ba9d2627cbc0739ba69890c30f95de046e4",
    "0xa1822b21202a24669eaf9277723d180cd6dae874",
    "0xec10243b54df1a71254f58873b389b7ecece89c2",
    "0x052aaae3cad5c095850246f8ffb228354c56752a",
    "0x91ddea05f741b34b63a7548338c90fc152c8631f",
  ],
};

const BLOCKSCOUT_BASE = "https://base.blockscout.com/api/v2";
const BLOCKSCOUT_UA =
  "Mozilla/5.0 (compatible; TrendingRepo/1.0; +https://trendingrepo.com)";
const BLOCKSCOUT_TIMEOUT_MS = 3_000;
const BLOCKSCOUT_CONCURRENCY = 5;

let lastHealthySnapshot: LiveX402Snapshot | null = null;

interface BsTx {
  hash?: string;
  timestamp?: string;
  status?: string;
  result?: string;
  to?: { hash?: string } | null;
  from?: { hash?: string } | null;
}

interface BsResponse {
  items?: BsTx[];
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index] as T, index);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

/** Fetch up to ~50 most recent inbound transactions for one address. */
export async function fetchAddressTxs(
  addr: string,
  options: { fetcher?: typeof fetch; timeoutMs?: number } = {},
): Promise<BsTx[]> {
  const url = `${BLOCKSCOUT_BASE}/addresses/${addr}/transactions?filter=to`;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? BLOCKSCOUT_TIMEOUT_MS,
  );
  try {
    const res = await (options.fetcher ?? fetch)(url, {
      signal: controller.signal,
      headers: { "User-Agent": BLOCKSCOUT_UA, Accept: "application/json" },
      // 15s server-side cache so the API route can poll without hammering
      // BlockScout. Client polls our route, our route polls BlockScout.
      next: { revalidate: 15 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as BsResponse;
    return data.items ?? [];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Aggregate live tx across all known x402 facilitator addresses on Base.
 * Returns the latest snapshot for the chart + delta UI.
 */
export async function fetchLiveX402(): Promise<LiveX402Snapshot> {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const fetchedAt = new Date().toISOString();

  // Flatten (name, addr) pairs so we can keep facilitator identity per call.
  const all: Array<{ name: string; addr: string }> = [];
  for (const [name, addrs] of Object.entries(FACILITATORS)) {
    for (const addr of addrs) all.push({ name, addr });
  }

  const responses = await mapWithConcurrency(
    all,
    BLOCKSCOUT_CONCURRENCY,
    ({ addr }) => fetchAddressTxs(addr),
  );

  interface Norm {
    hash: string;
    ts: number;
    facilitator: string;
    address: string;
  }
  const txs: Norm[] = [];
  responses.forEach((items, i) => {
    const { name, addr } = all[i];
    for (const tx of items) {
      if (!tx.hash || !tx.timestamp) continue;
      const ts = Date.parse(tx.timestamp);
      if (!Number.isFinite(ts)) continue;
      txs.push({ hash: tx.hash, ts, facilitator: name, address: addr });
    }
  });

  // Dedupe by hash (same tx may surface via multiple address queries on rare
  // multi-hop facilitator flows).
  const byHash = new Map<string, Norm>();
  for (const t of txs) {
    if (!byHash.has(t.hash)) byHash.set(t.hash, t);
  }
  const deduped = Array.from(byHash.values()).sort((a, b) => b.ts - a.ts);

  const totalObserved = deduped.length;
  const lastHour = deduped.filter((t) => t.ts >= hourAgo);
  const last24h = deduped.filter((t) => t.ts >= dayAgo);

  // Per-minute buckets for the last 60 minutes, oldest first so the chart
  // reads left → right naturally.
  const perMinute: LiveX402PerMinute[] = [];
  for (let i = 59; i >= 0; i--) {
    const bucketStart = now - i * 60_000;
    const bucketEnd = bucketStart + 60_000;
    const date = new Date(bucketStart);
    const minute = `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
    const count = lastHour.filter((t) => t.ts >= bucketStart && t.ts < bucketEnd).length;
    perMinute.push({
      minute,
      count,
      bucketStartIso: new Date(bucketStart).toISOString(),
    });
  }

  const perFacilitatorLastHour: Record<string, number> = {};
  for (const t of lastHour) {
    perFacilitatorLastHour[t.facilitator] =
      (perFacilitatorLastHour[t.facilitator] ?? 0) + 1;
  }

  // Top 10 most recent for the activity feed.
  const latestTxs = deduped.slice(0, 10).map((t) => ({
    hash: t.hash,
    timestamp: new Date(t.ts).toISOString(),
    facilitator: t.facilitator,
    address: t.address,
  }));

  // Healthy if at least one address response had any items at all.
  const healthy = responses.some((items) => items.length > 0);

  const snapshot: LiveX402Snapshot = {
    fetchedAt,
    totalLastHour: lastHour.length,
    totalLast24h: last24h.length,
    totalObserved,
    perMinute,
    perFacilitatorLastHour,
    latestTxs,
    healthy,
  };

  if (healthy) {
    lastHealthySnapshot = {
      ...snapshot,
      stale: false,
      lastGoodAt: fetchedAt,
    };
    return lastHealthySnapshot;
  }

  if (lastHealthySnapshot) {
    return {
      ...lastHealthySnapshot,
      healthy: false,
      stale: true,
      lastGoodAt: lastHealthySnapshot.lastGoodAt ?? lastHealthySnapshot.fetchedAt,
      attemptedAt: fetchedAt,
    };
  }

  return snapshot;
}

export function _resetLiveX402LastGoodForTests(): void {
  lastHealthySnapshot = null;
}
