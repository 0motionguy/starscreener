#!/usr/bin/env node
// CoinGecko "AI Agents" + adjacent categories fetcher.
//
// Sources (all free, no auth required for public-tier rate-limited usage):
//   /coins/markets?category=ai-agents
//   /coins/markets?category=ai-agent-launchpad
//   /coins/markets?category=ai-framework
//
// Output: .data/coingecko-agents-enrichment.json
//   { fetchedAt, raw: [...], normalized: [...] }
//
// Per-coin: market cap, 24h/7d price change, volume, ATH, last_updated.

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

const SEED_PATH = resolve(
  process.cwd(),
  "apps/trendingrepo-worker/src/fetchers/agent-commerce/seed-data.json",
);
const OUT_PATH = resolve(
  process.cwd(),
  ".data/coingecko-agents-enrichment.json",
);

const DRY_RUN = process.argv.includes("--dry-run");
const TIMEOUT_MS = parseNumberArg("--timeout-ms", 25_000);

function parseNumberArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx === process.argv.length - 1) return fallback;
  const n = parseInt(process.argv[idx + 1], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function fetchPage(category, page) {
  const url =
    `https://api.coingecko.com/api/v3/coins/markets` +
    `?vs_currency=usd&category=${encodeURIComponent(category)}` +
    `&order=market_cap_desc&per_page=100&page=${page}` +
    `&sparkline=false&price_change_percentage=24h%2C7d`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "TrendingRepo-AC-CoinGecko/0.1",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.warn(`  ${category} page ${page} → HTTP ${res.status}`);
      return [];
    }
    return await res.json();
  } catch (err) {
    console.warn(`  ${category} page ${page} → ${err?.message ?? err}`);
    return [];
  } finally {
    clearTimeout(t);
  }
}

function fmtMoney(n) {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

function normalize(coin, capturedAt) {
  const slug = slugify(coin.name);
  const change24 = coin.price_change_percentage_24h_in_currency ?? null;
  const change7 = coin.price_change_percentage_7d_in_currency ?? null;
  const briefParts = [];
  if (coin.market_cap) briefParts.push(`mcap ${fmtMoney(coin.market_cap)}`);
  if (coin.total_volume) briefParts.push(`24h vol ${fmtMoney(coin.total_volume)}`);
  if (change24 != null) briefParts.push(`24h ${change24.toFixed(1)}%`);
  return {
    name: coin.name,
    kind: "protocol",
    category: "payments",
    brief:
      `${coin.symbol?.toUpperCase()} — ${briefParts.join(" · ")} on CoinGecko AI Agents.`.slice(
        0,
        200,
      ),
    protocols: ["http"],
    pricing: { type: "free" },
    capabilities: ["agent-token", "tradable"],
    links: {
      website: `https://www.coingecko.com/en/coins/${coin.id}`,
    },
    badges: {
      agentActionable: false,
      verified: true,
      portalReady: false,
      x402Enabled: false,
      mcpServer: false,
    },
    stars7dDelta: 0,
    sources: [
      {
        source: "manual",
        url: `https://www.coingecko.com/en/coins/${coin.id}`,
        signalScore: Math.min(
          90,
          Math.round(35 + Math.log10((coin.market_cap ?? 0) + 1) * 4.5),
        ),
      },
    ],
    tags: [
      "agent-token",
      "coingecko",
      ...(coin.symbol ? [coin.symbol.toLowerCase()] : []),
      ...(change24 != null && change24 > 5 ? ["mover-up"] : []),
      ...(change24 != null && change24 < -5 ? ["mover-down"] : []),
    ],
    _coingecko: {
      id: coin.id,
      symbol: coin.symbol,
      marketCapUsd: coin.market_cap,
      marketCapRank: coin.market_cap_rank,
      currentPriceUsd: coin.current_price,
      volume24hUsd: coin.total_volume,
      change24hPct: change24,
      change7dPct: change7,
      ath: coin.ath,
      athDate: coin.ath_date,
      lastUpdated: coin.last_updated,
      slug,
    },
  };
}

async function main() {
  const categories = ["ai-agents", "ai-agent-launchpad", "ai-framework"];
  console.log(
    `[ac-cg] pulling ${categories.length} CoinGecko categories ...`,
  );
  const seen = new Map();
  for (const cat of categories) {
    const page1 = await fetchPage(cat, 1);
    for (const c of page1) {
      if (!seen.has(c.id)) seen.set(c.id, c);
    }
    console.log(`  ${cat.padEnd(24)} → ${page1.length} (total unique=${seen.size})`);
  }

  // Dedupe against seed by name slug
  const seed = JSON.parse(readFileSync(SEED_PATH, "utf8"));
  const seedSlugs = new Set(seed.entries.map((e) => slugify(e.name)));

  const capturedAt = new Date().toISOString();
  const all = Array.from(seen.values());
  const normalized = [];
  let dropped = 0;
  for (const coin of all) {
    const slug = slugify(coin.name);
    if (seedSlugs.has(slug)) {
      dropped++;
      continue;
    }
    // Skip very small caps
    if ((coin.market_cap ?? 0) < 100_000) {
      dropped++;
      continue;
    }
    normalized.push(normalize(coin, capturedAt));
  }
  normalized.sort(
    (a, b) =>
      (b._coingecko.marketCapUsd ?? 0) - (a._coingecko.marketCapUsd ?? 0),
  );

  console.log("");
  console.log(
    `[ac-cg] normalized=${normalized.length} (dropped ${dropped} as dup-or-small)`,
  );
  console.log("[ac-cg] top 10 by market cap:");
  for (const n of normalized.slice(0, 10)) {
    const cg = n._coingecko;
    console.log(
      `  ${(cg.symbol ?? "").toUpperCase().padEnd(10)} ${n.name.padEnd(30)} ${fmtMoney(cg.marketCapUsd).padEnd(10)} ${cg.change24hPct?.toFixed(1) ?? "—"}%`,
    );
  }

  if (DRY_RUN) {
    console.log("[ac-cg] --dry-run — nothing written.");
    return;
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        fetchedAt: capturedAt,
        sourceCount: all.length,
        normalizedCount: normalized.length,
        raw: all,
        normalized,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`[ac-cg] wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("[ac-cg] fatal:", err);
  process.exit(1);
});
