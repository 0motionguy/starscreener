# Phase A3 — Solana x402 Facilitator Indexer Spec

Mirror of [scripts/fetch-base-x402-onchain.mjs](../../scripts/fetch-base-x402-onchain.mjs) for the Solana side of the x402 ecosystem. Output: `.data/solana-x402-onchain.json`. Address book sourced from `Merit-Systems/x402scan` (path: `packages/external/facilitators/src/facilitators/*.ts`, branch `main`, fetched 2026-04-30).

---

## 1. Facilitator addresses

All addresses below were extracted directly from the x402scan source files referenced. Each entry contains a single SPL-token-paying address per facilitator (x402scan tracks one Solana address per facilitator at the moment) plus the `dateOfFirstTransaction` from the source as a sanity floor.

Confidence: **verified-from-x402scan-source** for everything in this table. x402scan is the canonical inventory used by every dashboard tracking x402 settlement; addresses are pulled from production code, not docs/PR commentary.

| Facilitator      | Solana address                                  | First tx (per source) | Confidence            |
| ---------------- | ----------------------------------------------- | --------------------- | --------------------- |
| AnySpend         | `34DmdeSbEnng2bmbSj9ActckY49km2HdhiyAwyXZucqP`  | 2025-11-03            | verified-x402scan     |
| AurraCloud       | `8x8CzkTHTYkW18frrTR7HdCV6fsjenvcykJAXWvoPQW`   | 2025-10-30            | verified-x402scan     |
| Bitrefill        | `PcTZWki36z5Y82TAATKK48XUdfsgmS5oLkw2Ta7vWyK`   | 2026-02-19            | verified-x402scan     |
| Cascade          | `7NetKx8TuRMBpqYFKZCVetkNuvWCPTrgekmGrsJwTmfN`  | 2026-03-05            | verified-x402scan     |
| CodeNut          | `HsozMJWWHNADoZRmhDGKzua6XW6NNfNDdQ4CkE9i5wHt`  | 2025-11-03            | verified-x402scan     |
| Corbits          | `AepWpq3GQwL8CeKMtZyKtKPa7W91Coygh3ropAJapVdU`  | 2025-09-21            | verified-x402scan     |
| Daydreams        | `DuQ4jFMmVABWGxabYHFkGzdyeJgS1hp4wrRuCtsJgT9a`  | 2025-10-16            | verified-x402scan     |
| Dexter           | `DEXVS3su4dZQWTvvPnLDJLRK1CeeKG6K3QqdzthgAkNV`  | 2025-10-26            | verified-x402scan     |
| OpenFacilitator  | `Hbe1vdFs4EQVVAzcV12muHhr6DEKwrT9roMXGPLxLBLP`  | 2026-01-01            | verified-x402scan     |
| OpenX402         | `5xvht4fYDs99yprfm4UeuHSLxMBRpotfBtUCQqM3oDNG`  | 2025-10-16            | verified-x402scan     |
| PayAI            | `2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4`  | 2025-07-01            | verified-x402scan     |
| PayAI            | `CjNFTjvBhbJJd2B5ePPMHRLx1ELZpa8dwQgGL727eKww`  | 2025-12-08            | verified-x402scan     |
| PayAI            | `8B5UKhwfAyFW67h58cBkQj1Ur6QXRgwWJJcQp8ZBsDPa`  | 2025-12-08            | verified-x402scan     |
| RelAI            | `4x4ZhcqiT1FnirM8Ne97iVupkN4NcQgc2YYbE2jDZbZn`  | 2026-01-23            | verified-x402scan     |
| UltravioletaDAO  | `F742C4VfFLQ9zRQyithoj5229ZgtX2WqKCSFKgH2EThq`  | 2025-10-30            | verified-x402scan     |
| x402jobs         | `561oabzy81vXYYbs1ZHR1bvpiEr6Nbfd6PGTxPshoz4p`  | 2025-12-11            | verified-x402scan     |

**Total: 16 addresses across 14 distinct facilitators.**

### Listed on x402.org/ecosystem but no Solana address in x402scan source

These show up on the public ecosystem page as "Solana-supporting" but x402scan's source either lists no Solana entry or the file doesn't exist yet. Not safe to encode addresses for them — leave out of the address book until x402scan ships them.

- **Auto** / **AutoIncentive Facilitator** — `auto.ts` has `Network.BASE: []` and no SOLANA entry.
- **KAMIYO Facilitator** — no `kamiyo.ts` in x402scan facilitators dir as of 2026-04-30.
- **SolPay** — no `solpay.ts` in x402scan; the canonical SolPay project does not publish a stable on-chain settlement address (the project ships an SDK, not a hosted facilitator).

Re-check these in the next sweep — x402scan adds new facilitators frequently.

### Source files (for the next sweep)

```
https://github.com/Merit-Systems/x402scan/tree/main/packages/external/facilitators/src/facilitators
```

To re-extract: hit `https://raw.githubusercontent.com/Merit-Systems/x402scan/main/packages/external/facilitators/src/facilitators/<name>.ts` and grep for `Network.SOLANA`.

---

## 2. Token mint

```
USDC_SOLANA = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
```

- Source: Circle, the official issuer of USDC on Solana. Confirmed via Solscan token page and Circle's `developers.circle.com` quickstart guide.
- Decimals: 6.
- Token program: `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` (legacy SPL Token, not Token-2022).
- All x402scan Solana facilitator entries currently bind to this mint as `USDC_SOLANA_TOKEN`.

---

## 3. RPC method strategy

### Chosen approach: `getSignaturesForAddress` → `getTransaction(jsonParsed, maxSupportedTransactionVersion: 0)`

**Step 1.** For each facilitator address `A`, call `getSignaturesForAddress(A, { limit: 1000, before: <cursor> })` to enumerate all transaction signatures in which `A` participates (signer or read-write account).

**Step 2.** For each signature, call `getTransaction(sig, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" })`.

**Step 3.** Identify x402 USDC settlements by walking `meta.preTokenBalances` + `meta.postTokenBalances`:

```
for each (pre, post) pair where mint == USDC_SOLANA_MINT:
  delta = post.uiTokenAmount.amount - pre.uiTokenAmount.amount
  if pre.owner == A  and delta < 0  → A sent USDC (settlement-from)
  if post.owner == A and delta > 0  → A received USDC (settlement-to)
```

A single x402 settlement typically shows USDC flowing **through** the facilitator: payer → facilitator → resource server. The Base fetcher only counts `from` (facilitator → USDC contract). The Solana analog: count txs where the facilitator's USDC token-account balance moved by ≥ 1 unit AND `meta.err == null`.

### Alternative considered, not chosen

| Alternative                                         | Why not                                                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `getTokenAccountsByOwner` + iterate                 | Returns balances, not history. Misses paging of historical txs.                                    |
| Helius `getTransactionsForAddress` enhanced API     | Requires API key. Free tier exists but rate-limited per credentialed user; we want zero-config.    |
| Solscan public API (`account/transactions`)         | Returns parsed token transfers directly. **Heavily rate-limited (~150 req/min) and unstable.** Worth a second-pass enrichment but not the primary path. |
| Solana Indexer (Triton/Geyser/etc.)                 | Paid. Out of scope for Phase A3.                                                                   |
| Helius Webhooks / DAS                               | Push, not pull. Doesn't fit cron-style indexer architecture.                                       |

**Tradeoff verdict:** RPC method is verbose (2 calls per tx, JSON parsed payload is ~5–15 KB) but free, vendor-neutral, and matches the Base fetcher's "no API key, no SDK, just `fetch`" ethos. Acceptable for Phase A3.

### Optional enrichment fallback

If `api.mainnet-beta.solana.com` returns 429 repeatedly, fall back to:

1. `https://rpc.ankr.com/solana` (no key, but rate-limited).
2. `https://solana-mainnet.g.alchemy.com/v2/demo` (Alchemy demo key — short-lived, rotates).

Document in the script header that operators should set `SOLANA_RPC_URL` env var to a paid endpoint for production use.

---

## 4. Public RPC endpoint + rate limits

**Primary:** `https://api.mainnet-beta.solana.com`

- **Per-IP limit:** 100 req / 10 s = ~10 rps sustained.
- **Per-method limit:** 40 req / 10 s for any single method (so `getTransaction` separately capped).
- **Concurrent:** 40 connections.
- **Behavior on overrun:** HTTP 429 (rate limit) or 403 (blocked). Retry-After is not always honored.
- **Soft limits:** `getSignaturesForAddress` with `limit: 1000` and `getTransaction` with `jsonParsed` are both heavy — back off conservatively.

**Implication for the indexer:**

- 16 addresses × up to 1000 sigs each × 1 `getTransaction` per sig = up to 16k `getTransaction` calls per full sweep.
- At 10 rps that's ~27 minutes worst-case. In practice most facilitators have < 200 lifetime txs, so realistic sweep is < 5 minutes.
- Hard-cap pages per address (see §6) to keep tail-cost bounded.
- Use `await sleep(120)` between RPC calls (≈ 8 rps) to stay well under the 10/s cap.

**Fallback chain (env-var driven):**

```
SOLANA_RPC_URL=$primary,$fallback1,$fallback2
```

Try in order; on 429/5xx rotate to the next.

---

## 5. Output schema (`.data/solana-x402-onchain.json`)

Mirrors the Base fetcher's shape, with Solana-specific fields where helpful:

```json
{
  "fetchedAt": "2026-04-30T12:00:00.000Z",
  "source": "api.mainnet-beta.solana.com",
  "chain": "solana",
  "totalTxs": 1234,
  "totalSettlements": 987,
  "byFacilitator": {
    "CodeNut": {
      "addressCount": 1,
      "totalTxs": 412,
      "x402Settlements": 380
    }
  },
  "byDay": {
    "2026-04-29": {
      "txs": 42,
      "byFacilitator": { "CodeNut": 30, "PayAI": 12 }
    }
  },
  "samples": [
    {
      "facilitator": "CodeNut",
      "txSig": "5Ny...abc",
      "from": "Hsoz...wHt",
      "to": "...",
      "amountUi": "0.001000",
      "amountRaw": "1000",
      "decimals": 6,
      "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "blockTime": "2026-04-29T12:34:56.000Z",
      "slot": 312891234
    }
  ],
  "facilitatorAddresses": {
    "CodeNut": ["HsozMJWWHNADoZRmhDGKzua6XW6NNfNDdQ4CkE9i5wHt"]
  }
}
```

Differences from Base fetcher:
- `txHash` → `txSig` (Solana convention).
- Added `slot` (Solana's block analog).
- Added `amountUi` / `amountRaw` / `decimals` because SPL token amounts are non-trivial to decode downstream.
- `chain: "solana"` so a future merger can union with `base-x402-onchain.json`.

---

## 6. Polling cadence

- `--max-pages-per-addr` default: **3** (each page = up to 1000 signatures, so ~3000 sig lookback per address).
  - Justification: The most active Solana facilitator (CodeNut) has been live since 2025-11-03. At an extrapolated peak of 200 settlements/day, 3000 is ~15 days of history per sweep — enough for the 30-day rolling window with comfortable overlap.
- `--page-size` default: **1000** (max allowed by Solana RPC).
- Cron cadence: **every 3h** (matches existing Base scraper cadence in `.github/workflows/scrape-trending.yml`-family).
- Sleep between RPC calls: **120 ms** (≈ 8 rps, under the 10/s cap with margin).
- `--dry-run` flag identical to Base script.
- `--addr <single-address>` filter for debugging a single facilitator.

---

## 7. Code skeleton (~30 lines, mirrors Base fetcher)

```js
#!/usr/bin/env node
// Free on-chain x402 settlement indexer for Solana via public RPC.
// Address book sourced from Merit-Systems/x402scan repo.
// Output: .data/solana-x402-onchain.json

import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

const OUT_PATH = resolve(process.cwd(), ".data/solana-x402-onchain.json");
const RPC = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const MAX_PAGES = parseNumberArg("--max-pages-per-addr", 3);
const PAGE_SIZE = 1000;
const RPC_DELAY_MS = 120;
const DRY_RUN = process.argv.includes("--dry-run");

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result;
}

async function getAllSignatures(addr, maxPages) {
  const all = [];
  let before = undefined;
  for (let p = 0; p < maxPages; p++) {
    const cfg = { limit: PAGE_SIZE, ...(before ? { before } : {}) };
    const sigs = await rpc("getSignaturesForAddress", [addr, cfg]);
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
    { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" },
  ]);
}

function isUsdcSettlement(tx, addr) {
  if (!tx || tx.meta?.err) return null; // skip failed txs
  const pre = tx.meta?.preTokenBalances ?? [];
  const post = tx.meta?.postTokenBalances ?? [];
  // Find a USDC balance change owned by addr
  for (const p of post) {
    if (p.mint !== USDC_MINT || p.owner !== addr) continue;
    const matchPre = pre.find((q) => q.accountIndex === p.accountIndex);
    const preAmt = BigInt(matchPre?.uiTokenAmount?.amount ?? "0");
    const postAmt = BigInt(p.uiTokenAmount?.amount ?? "0");
    const delta = postAmt - preAmt;
    if (delta !== 0n) {
      return {
        amountRaw: (delta < 0n ? -delta : delta).toString(),
        amountUi: (Number(delta < 0n ? -delta : delta) / 10 ** p.uiTokenAmount.decimals).toFixed(6),
        decimals: p.uiTokenAmount.decimals,
        direction: delta < 0n ? "out" : "in",
      };
    }
  }
  return null;
}

// main() loops the FACILITATORS map exactly like the Base script:
// for each [name, addrs]: for each addr: getAllSignatures → getTx (with sleep) → isUsdcSettlement
// accumulate byFacilitator + byDay + samples → write JSON.
```

The full implementation should also:
- Throttle `getTransaction` calls (the dominant cost) with a small concurrency pool (e.g. 4 in-flight) and per-call delay.
- Catch 429s explicitly and back off exponentially (start 1s, cap 30s).
- Log per-address progress like the Base fetcher (`name addr… txs=N usdc=M`).
- Mirror the Base fetcher's final summary table sorted by settlements.

---

## 8. Open questions for the implementer

- Should we cache signatures we've already seen across runs? (Base script doesn't — it's stateless.) Recommendation: stay stateless for parity; rely on `--max-pages-per-addr` to bound work.
- Some PayAI/CodeNut transfers may go via Token-2022 accounts in the future. Current sweep ignores Token-2022; flag in changelog if any facilitator migrates.
- Solscan enrichment as a second-pass would give USD-denominated totals without hand-decoding decimals. Defer to Phase A4.
