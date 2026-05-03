#!/usr/bin/env node
// Free on-chain x402 settlement indexer for Base via Blockscout v2.
// Address book sourced from Merit-Systems/x402scan repo.
// Output: .data/base-x402-onchain.json

import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

const OUT_PATH = resolve(process.cwd(), ".data/base-x402-onchain.json");
const MAX_PAGES = parseNumberArg("--max-pages-per-addr", 4);
const DRY_RUN = process.argv.includes("--dry-run");
const TIMEOUT_MS = 30_000;
const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

// data-store mirror — collector dual-writes file + Redis per CLAUDE.md
// convention. Skips silently when REDIS_URL/Upstash env is absent.
import { writeDataStore } from "./_data-store-write.mjs";

const FACILITATORS = {
  Coinbase: [
    "0xdbdf3d8ed80f84c35d01c6c9f9271761bad90ba6",
    "0x9aae2b0d1b9dc55ac9bab9556f9a26cb64995fb9",
    "0x3a70788150c7645a21b95b7062ab1784d3cc2104",
    "0x708e57b6650a9a741ab39cae1969ea1d2d10eca1",
    "0xce82eeec8e98e443ec34fda3c3e999cbe4cb6ac2",
    "0x7f6d822467df2a85f792d4508c5722ade96be056",
  ],
  Thirdweb: [
    "0x80c08de1a05df2bd633cf520754e40fde3c794d3",
    "0xaaca1ba9d2627cbc0739ba69890c30f95de046e4",
    "0xa1822b21202a24669eaf9277723d180cd6dae874",
    "0xec10243b54df1a71254f58873b389b7ecece89c2",
    "0x052aaae3cad5c095850246f8ffb228354c56752a",
    "0x91ddea05f741b34b63a7548338c90fc152c8631f",
  ],
  Heurist: [
    "0xb578b7db22581507d62bdbeb85e06acd1be09e11",
    "0x021cc47adeca6673def958e324ca38023b80a5be",
    "0x3f61093f61817b29d9556d3b092e67746af8cdfd",
    "0x290d8b8edcafb25042725cb9e78bcac36b8865f8",
    "0x612d72dc8402bba997c61aa82ce718ea23b2df5d",
    "0x1fc230ee3c13d0d520d49360a967dbd1555c8326",
  ],
  CodeNut: [
    "0x8d8fa42584a727488eeb0e29405ad794a105bb9b",
    "0x87af99356d774312b73018b3b6562e1ae0e018c9",
    "0x65058cf664d0d07f68b663b0d4b4f12a5e331a38",
    "0x88e13d4c764a6c840ce722a0a3765f55a85b327e",
  ],
};

function parseNumberArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx === process.argv.length - 1) return fallback;
  const n = parseInt(process.argv[idx + 1], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function fetchJson(url, timeoutMs = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "TrendingRepo-x402/0.1" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function dayKey(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}

async function fetchAddressTxsFrom(addr, maxPages = MAX_PAGES) {
  const all = [];
  let pageParams = null;
  for (let page = 0; page < maxPages; page++) {
    let url = `https://base.blockscout.com/api/v2/addresses/${addr}/transactions?filter=from`;
    if (pageParams) url += "&" + new URLSearchParams(pageParams).toString();
    let data;
    try {
      data = await fetchJson(url);
    } catch {
      break;
    }
    const items = data.items ?? [];
    all.push(...items);
    if (!data.next_page_params || items.length === 0) break;
    pageParams = data.next_page_params;
  }
  return all;
}

function isUsdcSettlement(tx) {
  return (
    tx?.to?.hash &&
    tx.to.hash.toLowerCase() === USDC_BASE &&
    tx.status !== "error"
  );
}

async function main() {
  console.log(
    `[x402] indexing ${Object.values(FACILITATORS).flat().length} addrs across ${Object.keys(FACILITATORS).length} facilitators`,
  );
  const fetchedAt = new Date().toISOString();
  const byFacilitator = {};
  const byDay = {};
  const samples = [];
  let totalTxs = 0;
  let totalSettlements = 0;

  for (const [name, addresses] of Object.entries(FACILITATORS)) {
    let facTxs = 0;
    let facSettlements = 0;
    for (const addr of addresses) {
      const txs = await fetchAddressTxsFrom(addr, MAX_PAGES);
      facTxs += txs.length;
      const settlements = txs.filter(isUsdcSettlement);
      facSettlements += settlements.length;
      for (const tx of settlements) {
        const day = dayKey(tx.timestamp);
        if (!byDay[day]) byDay[day] = { txs: 0, byFacilitator: {} };
        byDay[day].txs++;
        byDay[day].byFacilitator[name] =
          (byDay[day].byFacilitator[name] ?? 0) + 1;
        if (samples.length < 10) {
          samples.push({
            facilitator: name,
            txHash: tx.hash,
            from: tx.from?.hash,
            to: tx.to?.hash,
            timestamp: tx.timestamp,
            blockNumber: tx.block_number,
          });
        }
      }
      process.stdout.write(
        `  ${name.padEnd(10)} ${addr.slice(0, 10)}…  txs=${txs.length} usdc=${settlements.length}\n`,
      );
    }
    byFacilitator[name] = { addressCount: addresses.length, totalTxs: facTxs, x402Settlements: facSettlements };
    totalTxs += facTxs;
    totalSettlements += facSettlements;
  }

  console.log(`\n[x402] TOTAL: ${totalTxs} txs · ${totalSettlements} x402 settlements`);
  for (const [name, v] of Object.entries(byFacilitator).sort((a, b) => b[1].x402Settlements - a[1].x402Settlements)) {
    const share = totalSettlements ? ((v.x402Settlements / totalSettlements) * 100).toFixed(1) : "—";
    console.log(`  ${name.padEnd(10)} ${String(v.x402Settlements).padStart(5)} (${share}%)`);
  }

  if (DRY_RUN) {
    console.log("[x402] --dry-run");
    return;
  }
  const payload = {
    fetchedAt,
    source: "base.blockscout.com/api/v2",
    totalTxs,
    totalSettlements,
    byFacilitator,
    byDay,
    samples,
    facilitatorAddresses: FACILITATORS,
  };
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2), "utf8");
  console.log(`[x402] wrote ${OUT_PATH}`);
  const ds = await writeDataStore("base-x402-onchain", payload, {
    stampPerRecord: false,
  });
  console.log(`[x402] data-store: ${ds.source} @ ${ds.writtenAt}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[x402] fatal:", err);
    process.exit(1);
  });
