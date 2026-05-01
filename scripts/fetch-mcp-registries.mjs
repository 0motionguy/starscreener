#!/usr/bin/env node
// Pulls MCP server catalogs from the two canonical public registries:
//   1. Official MCP Registry — registry.modelcontextprotocol.io/v0.1/servers
//      (cursor-paginated, free, no auth, API freeze v0.1)
//   2. Glama Registry        — glama.ai/api/mcp/v1/servers
//      (cursor-paginated, free, no auth, ~22K servers indexed)
//
// Output: .data/mcp-registries-enrichment.json
//   { fetchedAt, official: [...], glama: [...], normalized: [...] }
//
// The build step merges normalized entries into the snapshot alongside the
// curated seed and the agentic.market catalog.
//
// Flags:
//   --dry-run             skip write
//   --max-official N      cap official-registry pages (default: all)
//   --max-glama N         cap Glama pages (default: 20 = 200 servers)
//   --concurrency N       reserved for future per-server enrichment (default: 1)
//   --timeout-ms N        per-request timeout (default: 20000)

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

const SEED_PATH = resolve(
  process.cwd(),
  "apps/trendingrepo-worker/src/fetchers/agent-commerce/seed-data.json",
);
const OUT_PATH = resolve(
  process.cwd(),
  ".data/mcp-registries-enrichment.json",
);

const DRY_RUN = process.argv.includes("--dry-run");
const MAX_OFFICIAL = parseNumberArg("--max-official", 0); // 0 = no cap
const MAX_GLAMA = parseNumberArg("--max-glama", 20);
const TIMEOUT_MS = parseNumberArg("--timeout-ms", 20_000);

function parseNumberArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx === process.argv.length - 1) return fallback;
  const n = parseInt(process.argv[idx + 1], 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "TrendingRepo-MCP-Registries/0.1",
        ...(opts.headers ?? {}),
      },
    });
    if (!res.ok) {
      return { ok: false, status: res.status };
    }
    return { ok: true, data: await res.json() };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------------------
// Official MCP Registry
// ---------------------------------------------------------------------------

async function fetchOfficial() {
  const all = [];
  let cursor = null;
  let pages = 0;

  while (true) {
    pages++;
    const url =
      "https://registry.modelcontextprotocol.io/v0.1/servers?limit=100" +
      (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
    const r = await fetchJson(url);
    if (!r.ok) {
      console.warn(`[ac-mcp] official page ${pages} failed: ${r.status ?? r.error}`);
      break;
    }
    const servers = r.data?.servers ?? [];
    all.push(...servers);
    const next = r.data?.metadata?.nextCursor;
    process.stdout.write(
      `  official page ${pages.toString().padStart(2)} (+${servers.length}) total=${all.length}${next ? "…" : " ✓"}\n`,
    );
    if (!next) break;
    if (MAX_OFFICIAL > 0 && pages >= MAX_OFFICIAL) {
      console.log(`  capped at --max-official ${MAX_OFFICIAL}`);
      break;
    }
    cursor = next;
  }
  return all;
}

function normalizeOfficial(entry, capturedAt) {
  const s = entry.server ?? {};
  const meta = entry._meta?.["io.modelcontextprotocol.registry/official"] ?? {};
  const display =
    s.title ||
    s.name ||
    "MCP Server";
  const remotes = s.remotes ?? [];
  const remoteUrl = remotes[0]?.url ?? null;
  const slug = slugify(display.replace(/^[^/]+\//, "")); // drop "ac.foo/" prefix
  return {
    name: display,
    kind: "tool",
    category: "infra",
    brief: (s.description ?? "").slice(0, 200),
    protocols: ["mcp", "http"],
    pricing: { type: "free" },
    capabilities: ["mcp", ...(remotes.length > 0 ? ["streamable-http"] : [])],
    links: {
      ...(remoteUrl ? { callEndpoint: remoteUrl } : {}),
    },
    badges: {
      mcpServer: true,
      agentActionable: true,
      verified: meta.status === "active",
      portalReady: false,
      x402Enabled: false,
    },
    stars7dDelta: 0,
    sources: [
      {
        source: "manual",
        url: `https://registry.modelcontextprotocol.io/v0.1/servers?search=${encodeURIComponent(s.name ?? display)}`,
        signalScore: meta.status === "active" ? 60 : 40,
      },
    ],
    tags: [
      "mcp",
      "official-registry",
      ...(meta.isLatest ? ["latest"] : []),
      ...(meta.status ? [`status-${meta.status}`] : []),
    ],
    _mcpRegistry: {
      source: "official",
      qualifiedName: s.name,
      version: s.version,
      isLatest: meta.isLatest === true,
      publishedAt: meta.publishedAt,
      updatedAt: meta.updatedAt,
      slug,
    },
  };
}

// ---------------------------------------------------------------------------
// Glama Registry
// ---------------------------------------------------------------------------

async function fetchGlama() {
  const all = [];
  let cursor = null;
  let pages = 0;

  while (true) {
    pages++;
    const url =
      "https://glama.ai/api/mcp/v1/servers" +
      (cursor ? `?after=${encodeURIComponent(cursor)}` : "");
    const r = await fetchJson(url);
    if (!r.ok) {
      console.warn(`[ac-mcp] glama page ${pages} failed: ${r.status ?? r.error}`);
      break;
    }
    const servers = r.data?.servers ?? [];
    all.push(...servers);
    // Glama pageInfo shape: { startCursor, endCursor, hasNextPage, hasPreviousPage }
    const next =
      r.data?.pageInfo?.hasNextPage && r.data?.pageInfo?.endCursor
        ? r.data.pageInfo.endCursor
        : null;
    process.stdout.write(
      `  glama page ${pages.toString().padStart(2)} (+${servers.length}) total=${all.length}${next ? "…" : " ✓"}\n`,
    );
    if (!next) break;
    if (MAX_GLAMA > 0 && pages >= MAX_GLAMA) {
      console.log(`  capped at --max-glama ${MAX_GLAMA}`);
      break;
    }
    cursor = next;
  }
  return all;
}

function normalizeGlama(entry, capturedAt) {
  const display = entry.name || entry.slug || "MCP Server";
  const repoUrl = entry.repository?.url ?? null;
  const githubMatch = repoUrl?.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git|\/|$)/i);
  const github = githubMatch?.[1];
  const remoteCapable = (entry.attributes ?? []).includes(
    "hosting:remote-capable",
  );
  const slug = slugify(display);
  return {
    name: display,
    kind: "tool",
    category: "infra",
    brief: (entry.description ?? "").split("\n")[0].slice(0, 200),
    protocols: ["mcp", "http"],
    pricing: { type: "free" },
    capabilities: [
      "mcp",
      ...(remoteCapable ? ["remote-capable"] : []),
      ...(entry.tools?.length ? ["tools"] : []),
    ],
    links: {
      ...(entry.url ? { website: entry.url } : {}),
      ...(github ? { github } : {}),
    },
    badges: {
      mcpServer: true,
      agentActionable: true,
      verified: false,
      portalReady: false,
      x402Enabled: false,
    },
    stars7dDelta: 0,
    sources: [
      {
        source: "manual",
        url: entry.url ?? `https://glama.ai/mcp/servers/${entry.id}`,
        signalScore: remoteCapable ? 55 : 45,
      },
    ],
    tags: [
      "mcp",
      "glama-registry",
      ...(remoteCapable ? ["remote-capable"] : []),
      ...((entry.attributes ?? []).map((a) => String(a).toLowerCase())),
    ],
    _mcpRegistry: {
      source: "glama",
      glamaId: entry.id,
      namespace: entry.namespace,
      glamaSlug: entry.slug,
      spdxLicense: entry.spdxLicense,
      slug,
    },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(
    `[ac-mcp] pulling MCP registries — max-official=${MAX_OFFICIAL || "all"}, max-glama=${MAX_GLAMA}`,
  );
  console.log("");

  console.log("[ac-mcp] phase 1 — official registry");
  const official = await fetchOfficial();

  console.log("");
  console.log("[ac-mcp] phase 2 — glama registry");
  const glama = await fetchGlama();

  console.log("");
  console.log(
    `[ac-mcp] totals: official=${official.length} glama=${glama.length}`,
  );

  // Dedupe against existing seed by slug.
  const seed = JSON.parse(readFileSync(SEED_PATH, "utf8"));
  const seenSlug = new Set(seed.entries.map((e) => slugify(e.name)));

  const capturedAt = new Date().toISOString();
  const seenNew = new Set();
  const normalized = [];

  for (const entry of official) {
    const built = normalizeOfficial(entry, capturedAt);
    const slug = built._mcpRegistry.slug;
    if (seenSlug.has(slug) || seenNew.has(slug)) continue;
    seenNew.add(slug);
    normalized.push(built);
  }

  for (const entry of glama) {
    const built = normalizeGlama(entry, capturedAt);
    const slug = built._mcpRegistry.slug;
    if (seenSlug.has(slug) || seenNew.has(slug)) continue;
    seenNew.add(slug);
    normalized.push(built);
  }

  console.log(
    `[ac-mcp] normalized + deduped: ${normalized.length} new MCP servers`,
  );

  if (DRY_RUN) {
    console.log("[ac-mcp] --dry-run — nothing written.");
    return;
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        fetchedAt: capturedAt,
        sources: {
          official: official.length,
          glama: glama.length,
        },
        normalized,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`[ac-mcp] wrote ${OUT_PATH}`);
  console.log(
    "[ac-mcp] next: run `npm run build:agent-commerce` to merge into the snapshot.",
  );
}

main().catch((err) => {
  console.error("[ac-mcp] fatal:", err);
  process.exit(1);
});
