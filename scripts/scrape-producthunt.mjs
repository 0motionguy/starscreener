#!/usr/bin/env node
// Scrape ProductHunt for AI-adjacent product launches (last 7d).
//
// Strategy:
//   1. Fan out 4 topic queries (artificial-intelligence, developer-tools,
//      saas, productivity) ordered by RANKING, postedAfter = now-7d.
//   2. Follow with one broad RANKING query (no topic filter) — catches
//      launches that ship without PH's AI tag but clearly are (MCP servers,
//      Claude skills, agent frameworks).
//   3. Dedupe by post ID, normalize, and apply the keyword filter so non-AI
//      productivity/SaaS launches drop out.
//   4. Extract github.com/<owner>/<repo> from website+description; match
//      against the tracked-repo set (same loader as scrape-hackernews.mjs)
//      so launches for tracked repos get linked.
//
// Auth: PRODUCTHUNT_TOKEN env var (required).
// Rate limit: ~5 calls per daily run, well under 100/hr cap.

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  phGraphQL,
  TOPICS,
  hasAiKeyword,
  extractGithubLink,
  extractXLink,
  daysBetween,
  resolveRedirect,
  discoverLinkedUrls,
  enrichWithGithub,
  sleep,
} from "./_ph-shared.mjs";
import { recentRepoRows } from "./_tracked-repos.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");
const TRENDING_IN = resolve(DATA_DIR, "trending.json");
const RECENT_IN = resolve(DATA_DIR, "recent-repos.json");
const OUT_PATH = resolve(DATA_DIR, "producthunt-launches.json");

const WINDOW_DAYS = 7;
const POSTS_PER_TOPIC = 50;
const BROAD_POSTS = 50;
const POLITE_PAUSE_MS = 1000;

// Topics whose presence alone qualifies a launch as AI-adjacent (no keyword
// check needed). Everything else falls through to hasAiKeyword.
const AI_TOPIC_SLUGS = new Set([
  "artificial-intelligence",
  "chatbots",
]);

const POSTS_QUERY = `
  query TopicPosts($topic: String!, $first: Int!, $postedAfter: DateTime) {
    posts(first: $first, order: RANKING, topic: $topic, postedAfter: $postedAfter) {
      edges {
        node {
          id
          name
          tagline
          description
          url
          votesCount
          commentsCount
          createdAt
          website
          thumbnail { url }
          topics(first: 8) { edges { node { slug name } } }
          makers { name username twitterUsername websiteUrl }
        }
      }
    }
  }
`;

const BROAD_QUERY = `
  query BroadPosts($first: Int!, $postedAfter: DateTime) {
    posts(first: $first, order: RANKING, postedAfter: $postedAfter) {
      edges {
        node {
          id
          name
          tagline
          description
          url
          votesCount
          commentsCount
          createdAt
          website
          thumbnail { url }
          topics(first: 8) { edges { node { slug name } } }
          makers { name username twitterUsername websiteUrl }
        }
      }
    }
  }
`;

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

async function loadTrackedRepos() {
  // Matches scrape-hackernews.mjs::loadTrackedRepos. We only care about
  // the Map<lowercaseFullName, canonicalFullName> — github-link matching
  // only needs lowercase keys.
  const tracked = new Map();
  try {
    const raw = await readFile(TRENDING_IN, "utf8");
    const trending = JSON.parse(raw);
    for (const langMap of Object.values(trending.buckets ?? {})) {
      for (const rows of Object.values(langMap)) {
        for (const row of rows ?? []) {
          const full = String(row.repo_name ?? "");
          if (!full.includes("/")) continue;
          const lower = full.toLowerCase();
          if (!tracked.has(lower)) tracked.set(lower, full);
        }
      }
    }
  } catch (err) {
    log(`warn: trending.json read failed — ${err.message}`);
  }
  try {
    const raw = await readFile(RECENT_IN, "utf8");
    const recent = JSON.parse(raw);
    const rows = recentRepoRows(recent);
    for (const row of rows) {
      const full = row.repo_name || row.fullName || row.full_name;
      if (!full || typeof full !== "string" || !full.includes("/")) continue;
      const lower = full.toLowerCase();
      if (!tracked.has(lower)) tracked.set(lower, full);
    }
  } catch {
    // recent-repos.json is optional.
  }
  return tracked;
}

export function normalizePost(node, tracked) {
  if (!node || typeof node !== "object") return null;
  if (!node.id || !node.createdAt) return null;

  const topics = (node.topics?.edges ?? [])
    .map((e) => e.node?.slug)
    .filter((s) => typeof s === "string" && s.length > 0);

  const makers = (Array.isArray(node.makers) ? node.makers : [])
    .map((m) => ({
      name: String(m?.name ?? ""),
      username: String(m?.username ?? ""),
      twitterUsername: m?.twitterUsername ? String(m.twitterUsername) : null,
      websiteUrl: m?.websiteUrl ? String(m.websiteUrl) : null,
    }))
    .filter((m) => m.name || m.username || m.twitterUsername || m.websiteUrl);

  const makerXUrl = (() => {
    const twitterUsername =
      makers.find((m) => m.twitterUsername)?.twitterUsername ?? null;
    if (!twitterUsername) return null;
    const handle = String(twitterUsername).replace(/^@+/, "").trim();
    return handle ? `https://x.com/${handle}` : null;
  })();

  const scanBlob = [
    node.website ?? "",
    node.description ?? "",
    ...makers.map((m) => m.websiteUrl ?? ""),
  ].join("\n");
  const ghMatch = extractGithubLink(scanBlob);
  const xUrl = extractXLink(scanBlob) ?? makerXUrl;
  let linkedRepo = null;
  if (ghMatch) {
    const lower = ghMatch.fullName.toLowerCase();
    if (tracked.has(lower)) linkedRepo = lower;
  }

  return {
    id: String(node.id),
    name: String(node.name ?? ""),
    tagline: String(node.tagline ?? ""),
    description: String(node.description ?? "").slice(0, 1000),
    url: String(node.url ?? ""),
    website: node.website ? String(node.website) : null,
    votesCount: Number.isFinite(node.votesCount) ? Number(node.votesCount) : 0,
    commentsCount: Number.isFinite(node.commentsCount)
      ? Number(node.commentsCount)
      : 0,
    createdAt: String(node.createdAt),
    thumbnail: node.thumbnail?.url ? String(node.thumbnail.url) : null,
    topics,
    makers,
    githubUrl: ghMatch?.url ?? null,
    xUrl,
    linkedRepo,
    daysSinceLaunch: daysBetween(node.createdAt),
  };
}

export function isAiAdjacent(launch) {
  if (!launch) return false;
  if (Array.isArray(launch.topics) && launch.topics.some((t) => AI_TOPIC_SLUGS.has(t))) {
    return true;
  }
  const blob = [
    launch.name ?? "",
    launch.tagline ?? "",
    launch.description ?? "",
    ...(Array.isArray(launch.topics) ? launch.topics : []),
  ].join(" ");
  return hasAiKeyword(blob);
}

async function fetchTopicPosts(token, topic, postedAfter) {
  const data = await phGraphQL(
    POSTS_QUERY,
    { topic, first: POSTS_PER_TOPIC, postedAfter },
    { token },
  );
  return (data?.posts?.edges ?? []).map((e) => e.node).filter(Boolean);
}

async function fetchBroadPosts(token, postedAfter) {
  const data = await phGraphQL(
    BROAD_QUERY,
    { first: BROAD_POSTS, postedAfter },
    { token },
  );
  return (data?.posts?.edges ?? []).map((e) => e.node).filter(Boolean);
}

async function main() {
  const token = process.env.PRODUCTHUNT_TOKEN;
  if (!token) {
    throw new Error(
      "PRODUCTHUNT_TOKEN not set — see https://www.producthunt.com/v2/oauth/applications",
    );
  }

  const tracked = await loadTrackedRepos();
  log(`tracked repos: ${tracked.size}`);

  const postedAfter = new Date(
    Date.now() - WINDOW_DAYS * 86_400_000,
  ).toISOString();
  log(`postedAfter: ${postedAfter}`);

  const allNodes = new Map();
  let queryErrors = 0;

  for (const topic of TOPICS) {
    try {
      const nodes = await fetchTopicPosts(token, topic, postedAfter);
      for (const n of nodes) {
        if (n?.id && !allNodes.has(n.id)) allNodes.set(n.id, n);
      }
      log(
        `topic "${topic}": ${nodes.length} posts (cumulative ${allNodes.size} unique)`,
      );
    } catch (err) {
      queryErrors += 1;
      log(`warn: topic "${topic}" failed — ${err.message}`);
    }
    await sleep(POLITE_PAUSE_MS);
  }

  try {
    const broad = await fetchBroadPosts(token, postedAfter);
    for (const n of broad) {
      if (n?.id && !allNodes.has(n.id)) allNodes.set(n.id, n);
    }
    log(
      `broad RANKING: ${broad.length} posts (cumulative ${allNodes.size} unique)`,
    );
  } catch (err) {
    queryErrors += 1;
    log(`warn: broad query failed — ${err.message}`);
  }

  if (allNodes.size === 0) {
    if (queryErrors >= TOPICS.length + 1) {
      throw new Error("all PH queries failed — check token / network");
    }
    log("warn: zero posts returned (API responded but returned nothing)");
  }

  // Normalize everything — NO AI pre-filter. We store all launches with an
  // aiAdjacent flag so the UI can serve both tabs ("AI Launches" filtered,
  // "All Launches" unfiltered) off a single committed JSON file.
  const launches = [];
  for (const n of allNodes.values()) {
    const norm = normalizePost(n, tracked);
    if (!norm) continue;
    norm.aiAdjacent = isAiAdjacent(norm);
    launches.push(norm);
  }

  // ---- Redirect resolution (curl subprocess) -----------------------------
  // PH's `website` field is a producthunt.com/r/<code> tracking redirect
  // that Cloudflare rejects for Node's fetch but accepts for curl. We
  // resolve each to its real URL, which is where github.com/<owner>/<repo>
  // usually lives for OSS launches. Fallback is quiet: if curl isn't on
  // PATH (some Windows dev setups) we log once and skip. GHA Ubuntu always
  // has curl.
  let resolvedCount = 0;
  let curlSkipped = false;
  const RESOLVE_BATCH = 6;
  for (let i = 0; i < launches.length; i += RESOLVE_BATCH) {
    const batch = launches.slice(i, i + RESOLVE_BATCH);
    await Promise.all(
      batch.map(async (l) => {
        if (!l.website) return;
        if (!l.website.includes("producthunt.com/r/")) return;
        const resolved = await resolveRedirect(l.website);
        if (resolved === null) {
          curlSkipped = true;
          return;
        }
        if (resolved !== l.website) {
          l.website = resolved;
          resolvedCount += 1;
          // Re-scan for github.com now that we have the real URL.
          if (!l.githubUrl) {
            const gh = extractGithubLink(resolved);
            if (gh) {
              l.githubUrl = gh.url;
              const lower = gh.fullName.toLowerCase();
              if (tracked.has(lower)) l.linkedRepo = lower;
            }
          }
        }
      }),
    );
  }
  if (curlSkipped) {
    log("warn: curl unavailable — redirect resolution skipped for some launches");
  }
  log(`resolved ${resolvedCount}/${launches.length} PH redirects via curl`);

  // ---- GitHub enrichment ------------------------------------------------
  // For each launch with a github.com URL, fetch metadata + README and
  // derive tags (mcp / claude-skill / agent / llm / rag / …). Runs
  // sequentially to keep memory flat; GitHub permits 5000 req/hr auth'd
  // which is >>100x what we need.
  const ghToken = process.env.GITHUB_TOKEN ?? null;
  let enrichedCount = 0;
  for (const l of launches) {
    if (!l.githubUrl) continue;
    const full = l.githubUrl.replace(/^https?:\/\/github\.com\//, "");
    const info = await enrichWithGithub(full, { token: ghToken });
    if (!info) continue;
    l.githubRepo = {
      stars: info.stars,
      topics: info.topics,
      readmeSnippet: info.readmeSnippet,
    };
    l.tags = info.tags;
    enrichedCount += 1;
  }
  log(`enriched ${enrichedCount} launches via GitHub API`);

  // Stable sort order: AI-first within vote rank, then votes desc, then
  // recency. The /producthunt "AI" tab filters on aiAdjacent; "All" sees
  // everything in this same order.
  launches.sort((a, b) => {
    if (a.aiAdjacent !== b.aiAdjacent) return a.aiAdjacent ? -1 : 1;
    if (b.votesCount !== a.votesCount) return b.votesCount - a.votesCount;
    return b.createdAt.localeCompare(a.createdAt);
  });

  const payload = {
    lastFetchedAt: new Date().toISOString(),
    windowDays: WINDOW_DAYS,
    launches,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");

  const aiCount = launches.filter((l) => l.aiAdjacent).length;
  const linkedCount = launches.filter((l) => l.linkedRepo).length;
  const withGhCount = launches.filter((l) => l.githubUrl).length;
  const top3 = launches
    .slice(0, 3)
    .map((l) => `${l.name} (${l.votesCount})`)
    .join(", ");
  log("");
  log(`wrote ${OUT_PATH}`);
  log(
    `  launches kept: ${launches.length} (${aiCount} AI-adjacent · ${withGhCount} with github · ${linkedCount} linked to tracked repos · ${enrichedCount} enriched)`,
  );
  log(`  top: ${top3 || "(none)"}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const isDirectRun = invokedPath
  ? fileURLToPath(import.meta.url) === invokedPath
  : false;

if (isDirectRun) {
  main().catch((err) => {
    console.error("scrape-producthunt failed:", err.message ?? err);
    process.exit(1);
  });
}
