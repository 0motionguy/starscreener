#!/usr/bin/env node
// Pulls the full x402 service catalog from api.agentic.market and normalizes
// each entry into our AgentCommerceItem-compatible shape so the build step
// can merge them into the snapshot alongside the hand-curated seed.
//
// Source: https://api.agentic.market/v1/services?limit=1000
//   — Confirmed via llms.txt (https://agentic.market/llms.txt). Free, no
//     auth, no rate limit advertised. Each service has 1+ x402-priced
//     endpoints with USDC pricing on Base / Solana / Polygon.
//
// Output: .data/agentic-market-enrichment.json
//   { fetchedAt, total, services: [...], normalized: [...] }
//
// Flags:
//   --dry-run        skip writing
//   --limit N        cap normalized output (default: all 604+)
//   --skip-questflow drop Questflow's "$500,000/call" entries (clearly placeholders)

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

const SEED_PATH = resolve(
  process.cwd(),
  "apps/trendingrepo-worker/src/fetchers/agent-commerce/seed-data.json",
);
const OUT_PATH = resolve(
  process.cwd(),
  ".data/agentic-market-enrichment.json",
);

const DRY_RUN = process.argv.includes("--dry-run");
const SKIP_QUESTFLOW = !process.argv.includes("--include-questflow");
const LIMIT = parseNumberArg("--limit", 0); // 0 = no cap
const TIMEOUT_MS = parseNumberArg("--timeout-ms", 25_000);

function parseNumberArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx === process.argv.length - 1) return fallback;
  const n = parseInt(process.argv[idx + 1], 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// agentic.market category → our taxonomy
function mapCategory(theirs) {
  switch ((theirs ?? "").toLowerCase()) {
    case "inference":
      return "inference";
    case "search":
    case "data":
      return "data";
    case "media":
    case "social":
    case "trading":
    case "travel":
    case "storage":
      return "data";
    case "infra":
    case "infrastructure":
      return "infra";
    case "marketplace":
      return "marketplace";
    default:
      return "data";
  }
}

function summarizePricing(endpoints) {
  const prices = (endpoints ?? [])
    .map((e) => parseFloat(e.pricing?.amount ?? "NaN"))
    .filter((n) => Number.isFinite(n) && n >= 0 && n < 100); // cap absurd $500K placeholders
  if (prices.length === 0) {
    return { type: "per_call", value: "x402 priced", currency: "USDC" };
  }
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const display =
    min === max
      ? `$${min.toFixed(min < 0.01 ? 4 : 3)}/call`
      : `$${min.toFixed(min < 0.01 ? 4 : 3)} – $${max.toFixed(max < 0.01 ? 4 : 3)}/call`;
  const networks = new Set();
  for (const e of endpoints ?? []) {
    const n = e.pricing?.network;
    if (n) networks.add(String(n).toLowerCase());
  }
  return {
    type: "per_call",
    value: display,
    currency: "USDC",
    chains: Array.from(networks),
  };
}

function normalize(svc, capturedAt) {
  const slug = slugify(svc.id || svc.name);
  const category = mapCategory(svc.category);
  const endpoints = svc.endpoints ?? [];
  const pricing = summarizePricing(endpoints);
  const isInference = category === "inference";
  const isInfra = svc.category === "Infra";

  const networks = (svc.networks ?? []).map((n) => String(n).toLowerCase());
  const protocols = ["x402", "http"];
  if (
    endpoints.some(
      (e) =>
        typeof e.url === "string" &&
        /\bmcp\b/i.test(`${e.url} ${e.description ?? ""}`),
    )
  ) {
    protocols.push("mcp");
  }

  const minPrice = endpoints
    .map((e) => parseFloat(e.pricing?.amount ?? "NaN"))
    .filter((n) => Number.isFinite(n) && n > 0 && n < 100)
    .reduce((a, b) => Math.min(a, b), Infinity);

  const baseSignal = endpoints.length > 0 ? 60 : 40;
  const networkBonus = Math.min(20, networks.length * 6);

  return {
    name: svc.name || svc.id,
    kind: isInfra ? "infra" : isInference ? "api" : "api",
    category,
    brief: (svc.description ?? "").slice(0, 200),
    protocols: Array.from(new Set(protocols)),
    pricing,
    capabilities: [
      svc.category?.toLowerCase() ?? "x402-service",
      ...(networks.includes("base") ? ["base"] : []),
      ...(networks.includes("solana") ? ["solana"] : []),
      "per-call-payment",
    ].filter(Boolean),
    links: {
      ...(svc.providerUrl
        ? { website: svc.providerUrl }
        : svc.domain
          ? { website: `https://${svc.domain}` }
          : {}),
      ...(endpoints[0]?.url ? { callEndpoint: endpoints[0].url } : {}),
    },
    badges: {
      x402Enabled: true,
      mcpServer: protocols.includes("mcp"),
      agentActionable: true,
      verified: svc.enriched === true,
      portalReady: false,
    },
    stars7dDelta: 0,
    sources: [
      {
        source: "agentic-market",
        url: svc.providerUrl || `https://agentic.market/services/${svc.id}`,
        signalScore: Math.min(95, baseSignal + networkBonus),
      },
    ],
    tags: [
      "x402",
      "live",
      ...(svc.category ? [String(svc.category).toLowerCase()] : []),
      ...(networks.length > 0 ? networks : []),
      ...(svc.isNew ? ["new"] : []),
    ],
    _agenticMarket: {
      id: svc.id,
      networks,
      endpointCount: endpoints.length,
      minPrice: Number.isFinite(minPrice) ? minPrice : null,
      integrationType: svc.integrationType ?? null,
      enriched: svc.enriched === true,
      isNew: svc.isNew === true,
      slug,
    },
  };
}

async function fetchCatalog() {
  const url = "https://api.agentic.market/v1/services?limit=1000";
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "TrendingRepo-AC-AgenticMarket/0.1",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${url}`);
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  console.log("[ac-am] fetching api.agentic.market/v1/services?limit=1000 ...");
  const data = await fetchCatalog();
  const services = Array.isArray(data.services) ? data.services : [];
  const total = data.total ?? services.length;
  console.log(`[ac-am] received ${services.length}/${total} services`);

  // Filter: drop the placeholder $500K Questflow entries (45 of them).
  const filtered = SKIP_QUESTFLOW
    ? services.filter((s) => s.provider !== "questflow.ai")
    : services;
  if (filtered.length !== services.length) {
    console.log(
      `[ac-am] filtered out ${services.length - filtered.length} questflow placeholder services`,
    );
  }

  // Dedupe against existing seed by name slug (case-insensitive).
  const seed = JSON.parse(readFileSync(SEED_PATH, "utf8"));
  const seenSlug = new Set(seed.entries.map((e) => slugify(e.name)));
  const fresh = filtered.filter((s) => !seenSlug.has(slugify(s.id || s.name)));
  console.log(
    `[ac-am] after seed-dedupe: ${fresh.length} new (overlap: ${filtered.length - fresh.length})`,
  );

  const capturedAt = new Date().toISOString();
  let normalized = fresh.map((s) => normalize(s, capturedAt));
  if (LIMIT > 0 && normalized.length > LIMIT) {
    normalized = normalized.slice(0, LIMIT);
    console.log(`[ac-am] capped to --limit ${LIMIT}`);
  }

  console.log("");
  console.log("[ac-am] category breakdown:");
  const cats = {};
  for (const n of normalized) cats[n.category] = (cats[n.category] ?? 0) + 1;
  for (const [k, v] of Object.entries(cats).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(14)} ${v}`);
  }

  console.log("");
  console.log("[ac-am] sample (top 8 by endpoint count):");
  const ranked = [...normalized].sort(
    (a, b) =>
      (b._agenticMarket.endpointCount ?? 0) -
      (a._agenticMarket.endpointCount ?? 0),
  );
  for (const n of ranked.slice(0, 8)) {
    console.log(
      `  ${(n._agenticMarket.endpointCount ?? 0).toString().padEnd(3)} eps  ` +
        `$${(n._agenticMarket.minPrice ?? 0).toFixed(4)}  ${n.name.padEnd(28)} ` +
        `${n._agenticMarket.networks.join(",")}`,
    );
  }

  if (DRY_RUN) {
    console.log("[ac-am] --dry-run — nothing written.");
    return;
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        fetchedAt: capturedAt,
        total,
        sourceCount: services.length,
        normalizedCount: normalized.length,
        services: filtered, // raw passthrough
        normalized,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log("");
  console.log(`[ac-am] wrote ${OUT_PATH}`);
  console.log(
    "[ac-am] next: run `npm run build:agent-commerce` to merge into the snapshot.",
  );
}

main().catch((err) => {
  console.error("[ac-am] fatal:", err);
  process.exit(1);
});
