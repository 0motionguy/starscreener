#!/usr/bin/env node
// Free on-chain x402 settlement indexer for Solana via public RPC.
// Address book sourced from Merit-Systems/x402scan repo (packages/external/facilitators).
// Output: .data/solana-x402-onchain.json
//
// Operators: set SOLANA_RPC_URL (comma-separated for fallback chain) for production.
// The default api.mainnet-beta.solana.com is rate-limited (~10 rps per-IP).

import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

const OUT_PATH = resolve(process.cwd(), ".data/solana-x402-onchain.json");
const RPC_ENDPOINTS = (process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const PAGE_SIZE = 1000;
// Public api.mainnet-beta.solana.com has a per-method cap of 40 req/10s
// (= 4 rps) for getTransaction. Concurrency 1 + 250ms sleep keeps us at
// ~4 rps single-threaded — anything higher 429s in seconds and never
// recovers under exponential backoff. Operators with a paid endpoint
// can override by setting CONCURRENCY env var.
const RPC_DELAY_MS = 250;
const TX_CONCURRENCY = parseNumberArg("--concurrency", 1);
const BACKOFF_START_MS = 1000;
const BACKOFF_CAP_MS = 30_000;
const TIMEOUT_MS = 30_000;
const MAX_PAGES = parseNumberArg("--max-pages-per-addr", 3);
const DRY_RUN = process.argv.includes("--dry-run");
const ADDR_FILTER = parseStringArg("--addr", null);

const FACILITATORS = {
  CodeNut: ["HsozMJWWHNADoZRmhDGKzua6XW6NNfNDdQ4CkE9i5wHt"],
  PayAI: [
    "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4",
    "CjNFTjvBhbJJd2B5ePPMHRLx1ELZpa8dwQgGL727eKww",
    "8B5UKhwfAyFW67h58cBkQj1Ur6QXRgwWJJcQp8ZBsDPa",
  ],
  Dexter: ["DEXVS3su4dZQWTvvPnLDJLRK1CeeKG6K3QqdzthgAkNV"],
  Bitrefill: ["PcTZWki36z5Y82TAATKK48XUdfsgmS5oLkw2Ta7vWyK"],
  RelAI: ["4x4ZhcqiT1FnirM8Ne97iVupkN4NcQgc2YYbE2jDZbZn"],
  UltravioletaDAO: ["F742C4VfFLQ9zRQyithoj5229ZgtX2WqKCSFKgH2EThq"],
  AnySpend: ["34DmdeSbEnng2bmbSj9ActckY49km2HdhiyAwyXZucqP"],
  AurraCloud: ["8x8CzkTHTYkW18frrTR7HdCV6fsjenvcykJAXWvoPQW"],
  Cascade: ["7NetKx8TuRMBpqYFKZCVetkNuvWCPTrgekmGrsJwTmfN"],
  Corbits: ["AepWpq3GQwL8CeKMtZyKtKPa7W91Coygh3ropAJapVdU"],
  Daydreams: ["DuQ4jFMmVABWGxabYHFkGzdyeJgS1hp4wrRuCtsJgT9a"],
  OpenFacilitator: ["Hbe1vdFs4EQVVAzcV12muHhr6DEKwrT9roMXGPLxLBLP"],
  OpenX402: ["5xvht4fYDs99yprfm4UeuHSLxMBRpotfBtUCQqM3oDNG"],
  x402jobs: ["561oabzy81vXYYbs1ZHR1bvpiEr6Nbfd6PGTxPshoz4p"],
};

function parseNumberArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx === process.argv.length - 1) return fallback;
  const n = parseInt(process.argv[idx + 1], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseStringArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx === process.argv.length - 1) return fallback;
  const v = process.argv[idx + 1];
  return v && !v.startsWith("--") ? v : fallback;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let rpcCursor = 0;

async function rpc(method, params, attempt = 0) {
  const endpoint = RPC_ENDPOINTS[rpcCursor % RPC_ENDPOINTS.length];
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "TrendingRepo-x402-solana/0.1",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: ctrl.signal,
    });
    if (res.status === 429 || res.status === 403 || res.status >= 500) {
      const backoff = Math.min(BACKOFF_START_MS * 2 ** attempt, BACKOFF_CAP_MS);
      if (RPC_ENDPOINTS.length > 1) rpcCursor++;
      console.warn(
        `[x402-sol] ${method} HTTP ${res.status}; backoff ${backoff}ms (attempt ${attempt + 1})`,
      );
      if (attempt >= 6) throw new Error(`HTTP ${res.status} after ${attempt + 1} attempts`);
      await sleep(backoff);
      return rpc(method, params, attempt + 1);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) {
      const msg = json.error.message ?? String(json.error.code);
      // RPC-level rate-limit (-32005) shows up as JSON error, not HTTP 429
      if (/rate|limit|429|too many/i.test(msg) && attempt < 6) {
        const backoff = Math.min(BACKOFF_START_MS * 2 ** attempt, BACKOFF_CAP_MS);
        if (RPC_ENDPOINTS.length > 1) rpcCursor++;
        console.warn(
          `[x402-sol] ${method} RPC rate-limit: ${msg}; backoff ${backoff}ms (attempt ${attempt + 1})`,
        );
        await sleep(backoff);
        return rpc(method, params, attempt + 1);
      }
      throw new Error(`${method}: ${msg}`);
    }
    return json.result;
  } finally {
    clearTimeout(t);
  }
}

async function getAllSignatures(addr, maxPages) {
  const all = [];
  let before;
  for (let p = 0; p < maxPages; p++) {
    const cfg = { limit: PAGE_SIZE, ...(before ? { before } : {}) };
    let sigs;
    try {
      sigs = await rpc("getSignaturesForAddress", [addr, cfg]);
    } catch (err) {
      console.warn(`[x402-sol] getSignaturesForAddress(${addr}) failed:`, err.message);
      break;
    }
    await sleep(RPC_DELAY_MS);
    if (!sigs?.length) break;
    all.push(...sigs);
    if (sigs.length < PAGE_SIZE) break;
    before = sigs[sigs.length - 1].signature;
  }
  return all;
}

async function getTx(sig) {
  return rpc("getTransaction", [
    sig,
    {
      encoding: "jsonParsed",
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    },
  ]);
}

function detectUsdcSettlement(tx, addr) {
  if (!tx || tx.meta?.err) return null;
  const pre = tx.meta?.preTokenBalances ?? [];
  const post = tx.meta?.postTokenBalances ?? [];
  for (const p of post) {
    if (p.mint !== USDC_MINT || p.owner !== addr) continue;
    const matchPre = pre.find((q) => q.accountIndex === p.accountIndex);
    const preAmt = BigInt(matchPre?.uiTokenAmount?.amount ?? "0");
    const postAmt = BigInt(p.uiTokenAmount?.amount ?? "0");
    const delta = postAmt - preAmt;
    if (delta === 0n) continue;
    const decimals = p.uiTokenAmount?.decimals ?? 6;
    const absDelta = delta < 0n ? -delta : delta;
    return {
      amountRaw: absDelta.toString(),
      amountUi: (Number(absDelta) / 10 ** decimals).toFixed(6),
      decimals,
      direction: delta < 0n ? "out" : "in",
      ownerAccount: p.owner,
    };
  }
  // Also catch outflows where the post entry is missing (account closed) — walk pre
  for (const q of pre) {
    if (q.mint !== USDC_MINT || q.owner !== addr) continue;
    const matchPost = post.find((p) => p.accountIndex === q.accountIndex);
    if (matchPost) continue; // already handled above
    const preAmt = BigInt(q.uiTokenAmount?.amount ?? "0");
    if (preAmt === 0n) continue;
    const decimals = q.uiTokenAmount?.decimals ?? 6;
    return {
      amountRaw: preAmt.toString(),
      amountUi: (Number(preAmt) / 10 ** decimals).toFixed(6),
      decimals,
      direction: "out",
      ownerAccount: q.owner,
    };
  }
  return null;
}

function dayKey(unixSeconds) {
  if (!unixSeconds) return "unknown";
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

// Bounded-concurrency map: process inputs through fn with at most `limit` in-flight.
async function pMapBounded(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

function selectFacilitators() {
  if (!ADDR_FILTER) return FACILITATORS;
  const filtered = {};
  for (const [name, addrs] of Object.entries(FACILITATORS)) {
    if (name === ADDR_FILTER || addrs.includes(ADDR_FILTER)) {
      filtered[name] = addrs.includes(ADDR_FILTER) && name !== ADDR_FILTER ? [ADDR_FILTER] : addrs;
    }
  }
  return filtered;
}

async function main() {
  const targets = selectFacilitators();
  const targetAddrCount = Object.values(targets).flat().length;
  const targetFacCount = Object.keys(targets).length;
  if (targetAddrCount === 0) {
    console.error(`[x402-sol] no facilitators matched --addr ${ADDR_FILTER}`);
    process.exit(2);
  }
  console.log(
    `[x402-sol] indexing ${targetAddrCount} addrs across ${targetFacCount} facilitators`,
  );
  console.log(`[x402-sol] rpc=${RPC_ENDPOINTS[0]}${RPC_ENDPOINTS.length > 1 ? ` (+${RPC_ENDPOINTS.length - 1} fallback)` : ""}`);
  console.log(`[x402-sol] max-pages-per-addr=${MAX_PAGES} concurrency=${TX_CONCURRENCY}`);

  const fetchedAt = new Date().toISOString();
  const byFacilitator = {};
  const byDay = {};
  const samples = [];
  let totalTxs = 0;
  let totalSettlements = 0;

  for (const [name, addresses] of Object.entries(targets)) {
    let facTxs = 0;
    let facSettlements = 0;
    for (const addr of addresses) {
      const sigs = await getAllSignatures(addr, MAX_PAGES);
      facTxs += sigs.length;
      let usdcCount = 0;

      const txResults = await pMapBounded(sigs, TX_CONCURRENCY, async (s) => {
        let tx;
        try {
          tx = await getTx(s.signature);
        } catch (err) {
          // Already retried inside rpc(); swallow and skip
          return null;
        }
        await sleep(RPC_DELAY_MS);
        const settle = detectUsdcSettlement(tx, addr);
        if (!settle) return null;
        return { sig: s, tx, settle };
      });

      for (const r of txResults) {
        if (!r) continue;
        usdcCount++;
        const blockTimeSec = r.tx.blockTime ?? r.sig.blockTime ?? null;
        const day = dayKey(blockTimeSec);
        if (!byDay[day]) byDay[day] = { txs: 0, byFacilitator: {} };
        byDay[day].txs++;
        byDay[day].byFacilitator[name] = (byDay[day].byFacilitator[name] ?? 0) + 1;
        if (samples.length < 10) {
          samples.push({
            facilitator: name,
            txSig: r.sig.signature,
            from: r.settle.direction === "out" ? addr : null,
            to: r.settle.direction === "in" ? addr : null,
            amountUi: r.settle.amountUi,
            amountRaw: r.settle.amountRaw,
            decimals: r.settle.decimals,
            mint: USDC_MINT,
            blockTime: blockTimeSec ? new Date(blockTimeSec * 1000).toISOString() : null,
            slot: r.tx.slot ?? r.sig.slot ?? null,
          });
        }
      }

      facSettlements += usdcCount;
      process.stdout.write(
        `  ${name.padEnd(16)} ${addr.slice(0, 10)}…  txs=${sigs.length} usdc=${usdcCount}\n`,
      );
    }
    byFacilitator[name] = {
      addressCount: addresses.length,
      totalTxs: facTxs,
      x402Settlements: facSettlements,
    };
    totalTxs += facTxs;
    totalSettlements += facSettlements;
  }

  console.log(`\n[x402-sol] TOTAL: ${totalTxs} txs · ${totalSettlements} x402 settlements`);
  for (const [name, v] of Object.entries(byFacilitator).sort(
    (a, b) => b[1].x402Settlements - a[1].x402Settlements,
  )) {
    const share = totalSettlements
      ? ((v.x402Settlements / totalSettlements) * 100).toFixed(1)
      : "—";
    console.log(`  ${name.padEnd(16)} ${String(v.x402Settlements).padStart(5)} (${share}%)`);
  }

  if (DRY_RUN) {
    console.log("[x402-sol] --dry-run");
    return;
  }
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        fetchedAt,
        source: RPC_ENDPOINTS[0],
        chain: "solana",
        totalTxs,
        totalSettlements,
        byFacilitator,
        byDay,
        samples,
        facilitatorAddresses: FACILITATORS,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`[x402-sol] wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("[x402-sol] fatal:", err);
  process.exit(1);
});
