#!/usr/bin/env node
// Build the bundled Agent Commerce snapshot from the seed file.
//
// Reads:  apps/trendingrepo-worker/src/fetchers/agent-commerce/seed-data.json
// Writes: data/agent-commerce.json
//
// Scoring formula must match src/lib/agent-commerce/scoring.ts exactly.
// When that file changes, port the change here too (or wire the worker
// to do this at runtime — v2 task).

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

import { writeDataStore, closeDataStore } from "./_data-store-write.mjs";

const SEED_PATH = resolve(
  process.cwd(),
  "apps/trendingrepo-worker/src/fetchers/agent-commerce/seed-data.json",
);
const OUT_PATH = resolve(process.cwd(), "data/agent-commerce.json");
const ENRICHMENT_PATH = resolve(
  process.cwd(),
  ".data/agent-commerce-live-enrichment.json",
);
const AGENTIC_MARKET_PATH = resolve(
  process.cwd(),
  ".data/agentic-market-enrichment.json",
);
const MCP_REGISTRIES_PATH = resolve(
  process.cwd(),
  ".data/mcp-registries-enrichment.json",
);
const SOCIAL_PATH = resolve(
  process.cwd(),
  ".data/agent-commerce-social-enrichment.json",
);
const OPENROUTER_PATH = resolve(
  process.cwd(),
  ".data/openrouter-enrichment.json",
);
const PORTAL_SNAPSHOT_PATH = resolve(
  process.cwd(),
  ".data/portal-probe-snapshot.json",
);
const COINGECKO_PATH = resolve(
  process.cwd(),
  ".data/coingecko-agents-enrichment.json",
);

// Optional Redis push when --push is passed. Uses REDIS_URL or UPSTASH_*.
// Without those env vars, the writer logs a warning and no-ops — file
// snapshot still lands. Lets a maintainer run the build locally and
// (with creds) refresh the prod cache without a deploy.
const PUSH_TO_REDIS = process.argv.includes("--push");

const NEUTRAL_AISO_PRIOR = 50;
const MAX_HYPE_PENALTY = 30;
const WEIGHTS = {
  githubVelocity: 0.20,
  socialMentions: 0.20,
  pricingClarity: 0.15,
  apiClarity: 0.15,
  aisoScore: 0.15,
  portalReady: 0.10,
  verifiedBoost: 0.05,
};

function clamp(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function scoreGithubVelocity(stars7dDelta) {
  if (!Number.isFinite(stars7dDelta) || stars7dDelta <= 0) return 0;
  return clamp((Math.log10(stars7dDelta + 1) / 3) * 100);
}

function scoreSocialMentions(sources) {
  const social = new Set(["hn", "reddit", "bluesky"]);
  let total = 0;
  for (const ref of sources) {
    if (social.has(ref.source)) total += ref.signalScore;
  }
  if (total <= 0) return 0;
  return clamp((Math.log10(total + 1) / 2.5) * 100);
}

function scorePricingClarity(pricing) {
  if (!pricing || pricing.type === "unknown") return 0;
  let n = 50;
  if (pricing.value && pricing.value.length > 0) n = 75;
  if (n === 75 && pricing.currency && Array.isArray(pricing.chains) && pricing.chains.length) {
    n = 100;
  }
  return n;
}

function scoreApiClarity(links) {
  let n = 0;
  if (links.github) n += 25;
  if (links.docs) n += 25;
  if (links.portalManifest) n += 25;
  if (links.callEndpoint) n += 25;
  return clamp(n);
}

function calcHypePenalty({ githubVelocity, socialMentions, pricingClarity }) {
  if (socialMentions < 60) return 0;
  if (githubVelocity > 20) return 0;
  if (pricingClarity > 25) return 0;
  const gap = socialMentions - githubVelocity;
  return Math.max(0, Math.min(MAX_HYPE_PENALTY, Math.round(gap * 0.4)));
}

function calcComposite(parts) {
  const aiso = parts.aisoScore ?? NEUTRAL_AISO_PRIOR;
  const verifiedBoost = parts.verified ? 100 : 0;
  const raw =
    WEIGHTS.githubVelocity * parts.githubVelocity +
    WEIGHTS.socialMentions * parts.socialMentions +
    WEIGHTS.pricingClarity * parts.pricingClarity +
    WEIGHTS.apiClarity * parts.apiClarity +
    WEIGHTS.aisoScore * aiso +
    WEIGHTS.portalReady * parts.portalReady +
    WEIGHTS.verifiedBoost * verifiedBoost;
  return clamp(Math.round(raw - parts.hypePenalty));
}

function makeSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function nowIso() {
  return new Date().toISOString();
}

function buildItem(entry, capturedAt, enrichmentBySlug, socialBySlug) {
  const slug = makeSlug(entry.name);
  const id = `${entry.kind}:${slug}`;

  const protocols = entry.protocols ?? [];
  const pricing = entry.pricing ?? { type: "unknown" };
  const capabilities = entry.capabilities ?? [];
  const links = entry.links ?? {};
  const tags = entry.tags ?? [];
  const aisoScore = typeof entry.aisoScore === "number" ? entry.aisoScore : null;

  const live = enrichmentBySlug?.get(slug);
  let stars7dDelta = entry.stars7dDelta ?? 0;
  if (live && typeof live.stars7dDelta === "number") {
    stars7dDelta = Math.max(stars7dDelta, live.stars7dDelta);
  }

  const sources = (entry.sources ?? []).map((s) => ({
    source: s.source,
    url: s.url,
    signalScore: s.signalScore ?? 50,
    capturedAt,
  }));

  // Append live HN signal as a source ref so it feeds socialMentions scoring.
  if (live?.hnMentions90d > 0) {
    const hnScore = Math.min(
      95,
      Math.round(30 + Math.log10(live.hnMentions90d + 1) * 25),
    );
    sources.push({
      source: "hn",
      url: live.hnTopUrl ?? `https://hn.algolia.com/?query=${encodeURIComponent(entry.name)}`,
      signalScore: hnScore,
      capturedAt,
    });
  }

  // Append social-source mentions (reddit/bluesky/devto/lobsters) so the
  // socialMentions sub-score picks them up. HF is appended as "manual" since
  // socialMentions only counts hn/reddit/bluesky.
  const social = socialBySlug?.get(slug);
  if (social) {
    const map = {
      reddit: "reddit",
      bluesky: "bluesky",
      devto: "devto",
      lobsters: "lobsters",
      hf: "manual",
    };
    for (const [src, sourceKey] of Object.entries(map)) {
      const entry2 = social[src];
      if (!entry2 || !entry2.count) continue;
      const top = entry2.topPosts?.[0];
      sources.push({
        source: sourceKey,
        url: top?.url ?? "",
        signalScore: Math.min(
          90,
          Math.round(28 + Math.log10(entry2.count + 1) * 26),
        ),
        capturedAt,
      });
    }
  }

  // Bump GitHub source signal with the live star count so scoring sees real adoption.
  if (live?.github) {
    const ghScore = Math.min(95, Math.round(40 + Math.log10(live.github.stars + 1) * 12));
    const existing = sources.find((s) => s.source === "github");
    if (existing) {
      existing.signalScore = Math.max(existing.signalScore, ghScore);
    } else {
      sources.push({
        source: "github",
        url: `https://github.com/${live.github.full_name}`,
        signalScore: ghScore,
        capturedAt,
      });
    }
  }

  const badges = {
    portalReady: !!(entry.badges && entry.badges.portalReady),
    agentActionable: !!(entry.badges && entry.badges.agentActionable),
    x402Enabled: !!(entry.badges && entry.badges.x402Enabled) || protocols.includes("x402"),
    mcpServer: !!(entry.badges && entry.badges.mcpServer) || protocols.includes("mcp"),
    verified: !!(entry.badges && entry.badges.verified),
  };

  const githubVelocity = scoreGithubVelocity(stars7dDelta);
  const socialMentions = scoreSocialMentions(sources);
  const pricingClarity = scorePricingClarity(pricing);
  const apiClarity = scoreApiClarity(links);
  const portalReadyScore = badges.portalReady ? 100 : 0;
  const hypePenalty = calcHypePenalty({ githubVelocity, socialMentions, pricingClarity });
  const composite = calcComposite({
    githubVelocity,
    socialMentions,
    pricingClarity,
    apiClarity,
    aisoScore,
    portalReady: portalReadyScore,
    verified: badges.verified,
    hypePenalty,
  });

  return {
    id,
    slug,
    name: entry.name,
    brief: entry.brief ?? "",
    kind: entry.kind,
    category: entry.category,
    protocols,
    pricing,
    capabilities,
    links,
    badges,
    scores: {
      composite,
      githubVelocity,
      socialMentions,
      pricingClarity,
      apiClarity,
      aisoScore,
      portalReady: portalReadyScore,
      hypePenalty,
    },
    sources,
    ...((live || social)
      ? {
          live: {
            ...(live?.github
              ? {
                  stars: live.github.stars,
                  forks: live.github.forks,
                  openIssues: live.github.openIssues,
                  pushedAt: live.github.pushedAt,
                  updatedAt: live.github.updatedAt,
                  defaultBranch: live.github.defaultBranch,
                  language: live.github.language,
                }
              : {}),
            ...(typeof live?.hnMentions90d === "number"
              ? { hnMentions90d: live.hnMentions90d }
              : {}),
            ...(live?.hnTopUrl ? { hnTopUrl: live.hnTopUrl } : {}),
            ...(live?.npm
              ? {
                  npmName: live.npm.name,
                  npmLatestVersion: live.npm.latestVersion ?? null,
                  npmWeeklyDownloads: live.npm.weeklyDownloads ?? null,
                  npmRegistryUrl: live.npm.registryUrl,
                }
              : {}),
            ...(social
              ? buildSocialLiveBlock(social)
              : {}),
            fetchedAt: live?.fetchedAt ?? capturedAt,
          },
        }
      : {}),
    firstSeenAt: capturedAt,
    lastUpdatedAt: capturedAt,
    tags,
  };
}

function loadEnrichment() {
  try {
    const raw = readFileSync(ENRICHMENT_PATH, "utf8");
    const enr = JSON.parse(raw);
    const map = new Map();
    for (const r of enr.results ?? []) {
      if (r?.slug) {
        map.set(r.slug, { ...r, fetchedAt: r.fetchedAt ?? enr.fetchedAt });
      }
    }
    console.log(
      `[agent-commerce] merged ${map.size} live enrichment records from ${ENRICHMENT_PATH}`,
    );
    return map;
  } catch {
    return null;
  }
}

function loadAgenticMarket() {
  try {
    const raw = readFileSync(AGENTIC_MARKET_PATH, "utf8");
    const data = JSON.parse(raw);
    const arr = Array.isArray(data.normalized) ? data.normalized : [];
    console.log(
      `[agent-commerce] merged ${arr.length} agentic.market services from ${AGENTIC_MARKET_PATH}`,
    );
    return { fetchedAt: data.fetchedAt, entries: arr };
  } catch {
    return null;
  }
}

function loadMcpRegistries() {
  try {
    const raw = readFileSync(MCP_REGISTRIES_PATH, "utf8");
    const data = JSON.parse(raw);
    const arr = Array.isArray(data.normalized) ? data.normalized : [];
    console.log(
      `[agent-commerce] merged ${arr.length} MCP registry servers from ${MCP_REGISTRIES_PATH}`,
    );
    return { fetchedAt: data.fetchedAt, entries: arr };
  } catch {
    return null;
  }
}

function buildSocialLiveBlock(social) {
  const out = {};
  const totals = [];
  const map = {
    reddit: "redditMentions",
    bluesky: "blueskyMentions",
    devto: "devtoMentions",
    lobsters: "lobstersMentions",
    hf: "huggingfaceSpaces",
  };
  for (const [src, key] of Object.entries(map)) {
    const e = social[src];
    if (!e?.count) continue;
    const top = e.topPosts?.[0];
    out[key] = {
      count: e.count,
      ...(top?.url ? { topUrl: top.url } : {}),
      ...(top?.title ? { topTitle: top.title } : {}),
    };
    totals.push(e.count);
  }
  if (totals.length > 0) {
    out.socialTotal = totals.reduce((a, b) => a + b, 0);
  }
  return out;
}

function loadPortalSnapshot() {
  try {
    const raw = readFileSync(PORTAL_SNAPSHOT_PATH, "utf8");
    const data = JSON.parse(raw);
    const byHost = data.byHost ?? {};
    const count = Object.keys(byHost).length;
    if (count === 0) return null;
    console.log(
      `[agent-commerce] merged ${count} Portal-Ready hosts from ${PORTAL_SNAPSHOT_PATH}`,
    );
    return byHost;
  } catch {
    return null;
  }
}

function safeHostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function loadCoinGecko() {
  try {
    const raw = readFileSync(COINGECKO_PATH, "utf8");
    const data = JSON.parse(raw);
    const arr = Array.isArray(data.normalized) ? data.normalized : [];
    console.log(
      `[agent-commerce] merged ${arr.length} CoinGecko agent tokens from ${COINGECKO_PATH}`,
    );
    return { fetchedAt: data.fetchedAt, entries: arr };
  } catch {
    return null;
  }
}

function loadOpenRouter() {
  try {
    const raw = readFileSync(OPENROUTER_PATH, "utf8");
    const data = JSON.parse(raw);
    const arr = Array.isArray(data.normalized) ? data.normalized : [];
    console.log(
      `[agent-commerce] merged ${arr.length} OpenRouter providers from ${OPENROUTER_PATH}`,
    );
    return { fetchedAt: data.fetchedAt, entries: arr };
  } catch {
    return null;
  }
}

function loadSocialEnrichment() {
  try {
    const raw = readFileSync(SOCIAL_PATH, "utf8");
    const data = JSON.parse(raw);
    const map = new Map();
    for (const [slug, sources] of Object.entries(data.perEntity ?? {})) {
      map.set(slug, sources);
    }
    console.log(
      `[agent-commerce] merged ${map.size} social-enrichment records from ${SOCIAL_PATH}`,
    );
    return { fetchedAt: data.fetchedAt, bySlug: map };
  } catch {
    return null;
  }
}

function applySocialToItem(item, social) {
  if (!social) return;
  const totals = [];
  const map = {
    reddit: "redditMentions",
    bluesky: "blueskyMentions",
    devto: "devtoMentions",
    lobsters: "lobstersMentions",
    hf: "huggingfaceSpaces",
  };
  item.live = item.live ?? {};
  for (const [src, key] of Object.entries(map)) {
    const entry = social[src];
    if (!entry || !entry.count) continue;
    const top = entry.topPosts?.[0];
    item.live[key] = {
      count: entry.count,
      ...(top?.url ? { topUrl: top.url } : {}),
      ...(top?.title ? { topTitle: top.title } : {}),
    };
    totals.push(entry.count);
    // Also push as a source ref so socialMentions sub-score sees it.
    const signalScore = Math.min(
      90,
      Math.round(28 + Math.log10(entry.count + 1) * 26),
    );
    const sourceKey =
      src === "reddit"
        ? "reddit"
        : src === "bluesky"
          ? "bluesky"
          : src === "devto"
            ? "devto"
            : src === "lobsters"
              ? "lobsters"
              : "manual";
    item.sources.push({
      source: sourceKey,
      url: top?.url ?? "",
      signalScore,
      capturedAt: item.lastUpdatedAt,
    });
  }
  if (totals.length > 0) {
    item.live.socialTotal = totals.reduce((a, b) => a + b, 0);
  }
}

async function main() {
  const seedRaw = readFileSync(SEED_PATH, "utf8");
  const seed = JSON.parse(seedRaw);
  const capturedAt = nowIso();
  const enrichmentBySlug = loadEnrichment();
  const agenticMarket = loadAgenticMarket();
  const mcpRegistries = loadMcpRegistries();
  const social = loadSocialEnrichment();
  const socialBySlug = social?.bySlug ?? null;

  const items = seed.entries.map((entry) =>
    buildItem(entry, capturedAt, enrichmentBySlug, socialBySlug),
  );

  function mergeFromExternal(label, source) {
    if (!source?.entries?.length) return;
    const seen = new Set(items.map((i) => i.slug));
    let added = 0;
    for (const entry of source.entries) {
      const slug = makeSlug(entry.name);
      if (seen.has(slug)) continue;
      const built = buildItem(entry, capturedAt, null, socialBySlug);
      built.live = built.live ?? {};
      built.live.fetchedAt = source.fetchedAt ?? capturedAt;
      // Promote provenance metadata from external normalizers into live block
      // so the UI can render token / endpoint / model-count specifics.
      if (entry._coingecko) {
        const cg = entry._coingecko;
        if (cg.symbol) built.live.tokenSymbol = String(cg.symbol).toUpperCase();
        if (typeof cg.marketCapUsd === "number")
          built.live.marketCapUsd = cg.marketCapUsd;
        if (typeof cg.marketCapRank === "number")
          built.live.marketCapRank = cg.marketCapRank;
        if (typeof cg.currentPriceUsd === "number")
          built.live.priceUsd = cg.currentPriceUsd;
        if (typeof cg.change24hPct === "number")
          built.live.priceChange24hPct = cg.change24hPct;
        if (typeof cg.change7dPct === "number")
          built.live.priceChange7dPct = cg.change7dPct;
        if (typeof cg.volume24hUsd === "number")
          built.live.volume24hUsd = cg.volume24hUsd;
      }
      items.push(built);
      seen.add(slug);
      added++;
    }
    console.log(
      `[agent-commerce] +${added} entries from ${label} (now ${items.length} total)`,
    );
  }

  mergeFromExternal("agentic.market", agenticMarket);
  mergeFromExternal("mcp-registries", mcpRegistries);
  const openrouter = loadOpenRouter();
  mergeFromExternal("openrouter", openrouter);
  const coingecko = loadCoinGecko();
  mergeFromExternal("coingecko", coingecko);

  const portalByHost = loadPortalSnapshot();
  if (portalByHost) {
    let stamped = 0;
    for (const item of items) {
      const host = safeHostFromUrl(item.links?.website);
      if (!host) continue;
      const portal = portalByHost[host];
      if (!portal) continue;
      item.badges.portalReady = true;
      item.scores.portalReady = 100;
      // re-derive composite without re-running the full formula:
      // add a +10 nudge (matches WEIGHTS.portalReady * 100 = 10).
      item.scores.composite = Math.min(100, item.scores.composite + 10);
      item.links = item.links ?? {};
      item.links.portalManifest = portal.manifestUrl;
      if (portal.x402) {
        item.badges.x402Enabled = true;
      }
      stamped++;
    }
    console.log(
      `[agent-commerce] stamped portalReady on ${stamped} items via host match`,
    );
  }

  items.sort((a, b) => b.scores.composite - a.scores.composite);

  const file = {
    fetchedAt: capturedAt,
    source: "agent-commerce-seed",
    windowDays: 30,
    items,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(file, null, 2), "utf8");

  console.log(`[agent-commerce] wrote ${items.length} items to ${OUT_PATH}`);
  console.log(`[agent-commerce] top 5:`);
  for (const item of items.slice(0, 5)) {
    console.log(`  ${item.scores.composite}  ${item.name}`);
  }

  if (PUSH_TO_REDIS) {
    const result = await writeDataStore("agent-commerce", file);
    console.log(`[agent-commerce] redis push: ${result.source} @ ${result.writtenAt}`);
    await closeDataStore();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[agent-commerce] fatal:", err);
    process.exit(1);
  });
