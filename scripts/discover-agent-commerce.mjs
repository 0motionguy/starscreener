#!/usr/bin/env node
// Discovery — finds Agent Commerce repos + npm packages NOT yet in our seed.
//
// Sources:
//   GitHub Search /search/repositories?q=topic:<topic>
//     topics: x402, mcp-server, agent-payments, agent-wallet, agent-commerce, a2a, x402scan
//   npm Search /-/v1/search?text=keywords:<keyword>
//     keywords: x402, mcp-server, agent-wallet, agent-commerce, a2a
//
// Filters:
//   - dedupe against existing seed by github full_name OR slug(name)
//   - GitHub: ≥5 stars OR pushed in last 90 days
//   - npm: ≥10 weekly downloads (skipped when --skip-npm-dl)
//
// Output:
//   .data/agent-commerce-discovery.json  — structured candidates, paste-ready
//
// Flags:
//   --dry-run         summarize, don't write
//   --concurrency N   default 4
//   --timeout-ms N    default 10000
//   --min-stars N     default 5
//   --skip-npm-dl     skip npm download lookups (faster)
//
// Auth:
//   GITHUB_TOKEN or GH_TOKEN env var → 5000 req/hr (vs 60/hr unauth).

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

const SEED_PATH = resolve(
  process.cwd(),
  "apps/trendingrepo-worker/src/fetchers/agent-commerce/seed-data.json",
);
const OUT_PATH = resolve(
  process.cwd(),
  ".data/agent-commerce-discovery.json",
);

const DRY_RUN = process.argv.includes("--dry-run");
const SKIP_NPM_DL = process.argv.includes("--skip-npm-dl");
const AUTO_MERGE = process.argv.includes("--auto-merge");
const CONCURRENCY = parseNumberArg("--concurrency", 4);
const TIMEOUT_MS = parseNumberArg("--timeout-ms", 10_000);
const MIN_STARS = parseNumberArg("--min-stars", 5);
// Auto-merge thresholds (looser than the discovery filter, but high enough
// to keep junk out of the seed without manual review).
const MERGE_MIN_GH_STARS = parseNumberArg("--merge-min-stars", 100);
const MERGE_MIN_NPM_DOWNLOADS = parseNumberArg("--merge-min-npm-dl", 200);
const MERGE_MAX_NEW = parseNumberArg("--merge-max-new", 50);
const TOKEN = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";

// Auto-merge topic gate: a discovered repo only qualifies for auto-merge if
// its GitHub `topics` array includes at least one of these. Prevents
// tangentially-relevant repos (n8n, gemini-cli, etc.) sneaking through.
const AUTO_MERGE_REQUIRED_TOPICS = [
  "x402",
  "mcp-server",
  "agent-payments",
  "agent-wallet",
  "agent-commerce",
  "a2a",
];

// Auto-merge push-recency floor (in days). A repo with a qualifying
// topic but no push activity in the last year is likely abandoned —
// reject so it lands in the rejected sidecar for human review instead
// of inflating the seed.
const AUTO_MERGE_MAX_PUSH_AGE_DAYS = 365;

function qualifiesForAutoMerge(candidate) {
  const topics = candidate?._discovery?.topics ?? [];
  if (!topics.some((t) => AUTO_MERGE_REQUIRED_TOPICS.includes(t))) return false;
  const pushedAt = candidate?._discovery?.pushedAt;
  if (pushedAt) {
    const ageDays = (Date.now() - new Date(pushedAt).getTime()) / 86_400_000;
    if (Number.isFinite(ageDays) && ageDays > AUTO_MERGE_MAX_PUSH_AGE_DAYS) {
      return false;
    }
  }
  return true;
}

function parseNumberArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx === process.argv.length - 1) return fallback;
  const n = parseInt(process.argv[idx + 1], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (res.status === 403 || res.status === 429) {
      return { ok: false, status: res.status, rateLimited: true };
    }
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  } finally {
    clearTimeout(t);
  }
}

function ghHeaders() {
  const h = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "TrendingRepo-AC-Discover/0.1",
  };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}

async function searchGithubByTopic(topic) {
  const url = `https://api.github.com/search/repositories?q=topic:${encodeURIComponent(
    topic,
  )}&sort=stars&order=desc&per_page=50`;
  const r = await fetchJson(url, { headers: ghHeaders() });
  if (!r.ok) return [];
  return (r.data?.items ?? []).map((repo) => ({
    source: "github",
    sourceTopic: topic,
    fullName: repo.full_name,
    name: repo.name,
    description: repo.description,
    homepage: repo.homepage,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    pushedAt: repo.pushed_at,
    language: repo.language,
    topics: repo.topics ?? [],
    htmlUrl: repo.html_url,
  }));
}

async function searchNpmByKeyword(keyword) {
  const url = `https://registry.npmjs.org/-/v1/search?text=keywords:${encodeURIComponent(
    keyword,
  )}&size=50`;
  const r = await fetchJson(url, {
    headers: { "User-Agent": "TrendingRepo-AC-Discover/0.1" },
  });
  if (!r.ok) return [];
  return (r.data?.objects ?? []).map((obj) => ({
    source: "npm",
    sourceKeyword: keyword,
    name: obj.package?.name,
    description: obj.package?.description,
    version: obj.package?.version,
    keywords: obj.package?.keywords ?? [],
    publisher: obj.package?.publisher?.username,
    date: obj.package?.date,
    npmLink: obj.package?.links?.npm,
    homepage: obj.package?.links?.homepage,
    repository: obj.package?.links?.repository,
    score: obj.score?.final,
    quality: obj.score?.detail?.quality,
    popularity: obj.score?.detail?.popularity,
  }));
}

async function fetchNpmWeeklyDownloads(name) {
  const r = await fetchJson(
    `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(name).replace(/%2F/g, "/")}`,
    { headers: { "User-Agent": "TrendingRepo-AC-Discover/0.1" } },
  );
  return r.ok ? r.data?.downloads ?? null : null;
}

// ---------------------------------------------------------------------------
// Heuristics: classify a discovery hit into kind/category/protocols/tags
// ---------------------------------------------------------------------------

function classifyByTopicOrKeyword(topic) {
  switch (topic) {
    case "x402":
    case "x402scan":
      return {
        kind: "tool",
        category: "payments",
        protocols: ["x402", "http"],
        baseTags: ["x402", "payments"],
      };
    case "mcp-server":
      return {
        kind: "tool",
        category: "infra",
        protocols: ["mcp"],
        baseTags: ["mcp"],
      };
    case "agent-payments":
      return {
        kind: "infra",
        category: "payments",
        protocols: ["http"],
        baseTags: ["payments", "agents"],
      };
    case "agent-wallet":
      return {
        kind: "wallet",
        category: "auth",
        protocols: ["http"],
        baseTags: ["wallet"],
      };
    case "agent-commerce":
      return {
        kind: "infra",
        category: "marketplace",
        protocols: ["http"],
        baseTags: ["agent-commerce"],
      };
    case "a2a":
      return {
        kind: "protocol",
        category: "infra",
        protocols: ["a2a", "http"],
        baseTags: ["a2a"],
      };
    default:
      return {
        kind: "tool",
        category: "infra",
        protocols: ["http"],
        baseTags: [topic],
      };
  }
}

function buildSeedCandidateFromGithub(hit, classification, npmDownloads) {
  const slug = slugify(hit.name);
  const tags = Array.from(
    new Set([
      ...classification.baseTags,
      ...(hit.topics ?? []).slice(0, 5),
    ]),
  );
  return {
    name: hit.name,
    kind: classification.kind,
    category: classification.category,
    brief: (hit.description ?? "").slice(0, 200),
    protocols: classification.protocols,
    pricing: { type: "unknown" },
    capabilities: classification.baseTags.slice(0, 4),
    links: {
      ...(hit.homepage ? { website: hit.homepage } : {}),
      github: hit.fullName,
    },
    badges: {
      x402Enabled: classification.protocols.includes("x402"),
      mcpServer: classification.protocols.includes("mcp"),
      agentActionable: true,
    },
    stars7dDelta: 0,
    sources: [
      {
        source: "github",
        url: hit.htmlUrl,
        signalScore: Math.min(
          90,
          Math.round(35 + Math.log10((hit.stars ?? 0) + 1) * 12),
        ),
      },
      ...(typeof npmDownloads === "number" && npmDownloads > 0
        ? [
            {
              source: "npm",
              url: `https://www.npmjs.com/package/${hit.name}`,
              signalScore: Math.min(
                90,
                Math.round(30 + Math.log10(npmDownloads + 1) * 14),
              ),
            },
          ]
        : []),
    ],
    tags,
    _discovery: {
      sourceTopic: hit.sourceTopic,
      stars: hit.stars,
      pushedAt: hit.pushedAt,
      language: hit.language,
      slug,
    },
  };
}

function buildSeedCandidateFromNpm(hit, classification, weeklyDownloads) {
  const display = hit.name.replace(/^@[^/]+\//, "").replace(/-/g, " ");
  const tags = Array.from(
    new Set([
      ...classification.baseTags,
      ...(hit.keywords ?? []).slice(0, 5),
    ]),
  );
  const repoMatch =
    typeof hit.repository === "string"
      ? hit.repository.match(
          /github\.com\/([^/]+\/[^/]+?)(?:\.git|\/|$)/i,
        )?.[1]
      : null;
  return {
    name: display,
    kind: classification.kind,
    category: classification.category,
    brief: (hit.description ?? "").slice(0, 200),
    protocols: classification.protocols,
    pricing: { type: "unknown" },
    capabilities: classification.baseTags.slice(0, 4),
    links: {
      ...(hit.homepage ? { website: hit.homepage } : {}),
      ...(repoMatch ? { github: repoMatch } : {}),
    },
    badges: {
      x402Enabled: classification.protocols.includes("x402"),
      mcpServer: classification.protocols.includes("mcp"),
      agentActionable: true,
    },
    stars7dDelta: 0,
    sources: [
      {
        source: "npm",
        url: hit.npmLink ?? `https://www.npmjs.com/package/${hit.name}`,
        signalScore: Math.min(
          90,
          Math.round(
            25 + Math.log10((weeklyDownloads ?? 0) + 1) * 14,
          ),
        ),
      },
    ],
    tags,
    _discovery: {
      sourceKeyword: hit.sourceKeyword,
      npmName: hit.name,
      version: hit.version,
      weeklyDownloads: weeklyDownloads ?? null,
      slug: slugify(display),
    },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const seed = JSON.parse(readFileSync(SEED_PATH, "utf8"));

  // Build dedupe sets over existing seed: github full_name (lowercase) + slug.
  const seenGithub = new Set();
  const seenSlug = new Set();
  for (const entry of seed.entries) {
    if (entry.links?.github) seenGithub.add(entry.links.github.toLowerCase());
    seenSlug.add(slugify(entry.name));
  }

  const githubTopics = [
    "x402",
    "x402scan",
    "mcp-server",
    "agent-payments",
    "agent-wallet",
    "agent-commerce",
    "a2a",
  ];
  const npmKeywords = [
    "x402",
    "mcp-server",
    "agent-wallet",
    "agent-commerce",
  ];

  console.log(
    `[ac-discover] github_topics=${githubTopics.length} npm_keywords=${npmKeywords.length} ` +
      `concurrency=${CONCURRENCY} token=${TOKEN ? "yes" : "no"} skip_npm_dl=${SKIP_NPM_DL}`,
  );
  console.log("");

  // Pull all GitHub topic searches concurrently.
  console.log("[ac-discover] phase 1 — github topic search");
  const ghHits = (
    await Promise.all(githubTopics.map((t) => searchGithubByTopic(t)))
  ).flat();
  console.log(`  fetched ${ghHits.length} repo hits across ${githubTopics.length} topics`);

  // Dedupe by full_name, then filter against seed.
  const ghByFullName = new Map();
  for (const hit of ghHits) {
    if (!hit.fullName) continue;
    const key = hit.fullName.toLowerCase();
    if (seenGithub.has(key)) continue;
    if (seenSlug.has(slugify(hit.name))) continue;
    if ((hit.stars ?? 0) < MIN_STARS) {
      const ageDays = hit.pushedAt
        ? (Date.now() - new Date(hit.pushedAt).getTime()) / 86_400_000
        : 9999;
      if (ageDays > 90) continue; // not stars + not fresh → skip
    }
    const prior = ghByFullName.get(key);
    if (!prior || (hit.stars ?? 0) > (prior.stars ?? 0)) {
      ghByFullName.set(key, hit);
    }
  }
  console.log(`  candidates after dedupe + filter: ${ghByFullName.size}`);

  // Pull npm searches in parallel.
  console.log("[ac-discover] phase 2 — npm keyword search");
  const npmHits = (
    await Promise.all(npmKeywords.map((k) => searchNpmByKeyword(k)))
  ).flat();
  console.log(`  fetched ${npmHits.length} package hits across ${npmKeywords.length} keywords`);

  const npmByName = new Map();
  for (const hit of npmHits) {
    if (!hit.name) continue;
    if (seenSlug.has(slugify(hit.name))) continue;
    if (seenSlug.has(slugify(hit.name.replace(/^@[^/]+\//, "")))) continue;
    const prior = npmByName.get(hit.name);
    if (!prior || (hit.score ?? 0) > (prior.score ?? 0)) {
      npmByName.set(hit.name, hit);
    }
  }
  console.log(`  candidates after dedupe + filter: ${npmByName.size}`);

  // Optionally fetch weekly downloads to filter low-traction npm packages.
  console.log("[ac-discover] phase 3 — npm weekly downloads enrichment");
  const npmEnriched = [];
  let cursor = 0;
  const npmCandidates = Array.from(npmByName.values());
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < npmCandidates.length) {
      const idx = cursor++;
      const hit = npmCandidates[idx];
      const dl = SKIP_NPM_DL
        ? null
        : await fetchNpmWeeklyDownloads(hit.name);
      if (!SKIP_NPM_DL && (dl == null || dl < 10)) continue;
      npmEnriched.push({ hit, weeklyDownloads: dl });
    }
  });
  await Promise.all(workers);
  console.log(
    `  npm packages with ≥10/wk: ${npmEnriched.length} (${SKIP_NPM_DL ? "skipped" : "filtered"})`,
  );

  // Optionally backfill GitHub stars for npm packages that link to a github repo we already discovered.
  // (Not done in v1 — we just rely on the topic-search results.)

  // Build candidate seed entries (paste-ready into seed-data.json).
  const candidatesGithub = Array.from(ghByFullName.values())
    .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
    .map((hit) =>
      buildSeedCandidateFromGithub(
        hit,
        classifyByTopicOrKeyword(hit.sourceTopic),
        null,
      ),
    );

  const candidatesNpm = npmEnriched
    .sort(
      (a, b) =>
        (b.weeklyDownloads ?? 0) - (a.weeklyDownloads ?? 0),
    )
    .map(({ hit, weeklyDownloads }) =>
      buildSeedCandidateFromNpm(
        hit,
        classifyByTopicOrKeyword(hit.sourceKeyword),
        weeklyDownloads,
      ),
    );

  console.log("");
  console.log("[ac-discover] top GitHub finds:");
  for (const c of candidatesGithub.slice(0, 10)) {
    console.log(
      `  ★${c._discovery.stars.toString().padEnd(6)} ${c.name.padEnd(36)} ${c.links.github}`,
    );
  }
  console.log("");
  console.log("[ac-discover] top npm finds:");
  for (const c of candidatesNpm.slice(0, 10)) {
    console.log(
      `  npm ${(c._discovery.weeklyDownloads ?? 0).toString().padEnd(8)}/wk ${c.name.padEnd(40)} ${c._discovery.npmName}`,
    );
  }

  const out = {
    fetchedAt: new Date().toISOString(),
    summary: {
      githubCandidates: candidatesGithub.length,
      npmCandidates: candidatesNpm.length,
      seedCount: seed.entries.length,
    },
    candidates: {
      github: candidatesGithub,
      npm: candidatesNpm,
    },
  };

  if (DRY_RUN) {
    console.log("");
    console.log("[ac-discover] --dry-run — nothing written.");
    return;
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), "utf8");
  console.log("");
  console.log(`[ac-discover] wrote ${OUT_PATH}`);
  console.log(
    `[ac-discover] review and merge into seed: ${candidatesGithub.length + candidatesNpm.length} new candidates.`,
  );

  // ---- Auto-merge gate ----
  if (AUTO_MERGE) {
    const ghPass = candidatesGithub.filter(
      (c) => (c._discovery?.stars ?? 0) >= MERGE_MIN_GH_STARS,
    );
    const npmPass = candidatesNpm.filter(
      (c) => (c._discovery?.weeklyDownloads ?? 0) >= MERGE_MIN_NPM_DOWNLOADS,
    );
    let promoted = [...ghPass, ...npmPass].slice(0, MERGE_MAX_NEW);
    // Final dedupe (slug already deduped against seed; also dedupe pairs)
    const seen = new Set();
    promoted = promoted.filter((c) => {
      const slug =
        c._discovery?.slug ??
        slugify(c._discovery?.npmName ?? c.name ?? "");
      if (seen.has(slug)) return false;
      seen.add(slug);
      return true;
    });
    if (promoted.length === 0) {
      console.log(
        "[ac-discover] auto-merge: 0 candidates passed thresholds (min-stars=" +
          MERGE_MIN_GH_STARS +
          ", min-npm-dl=" +
          MERGE_MIN_NPM_DOWNLOADS +
          ").",
      );
      return;
    }
    // Append to seed-data.json. Strip _discovery before persisting; keep
    // remaining fields in the same shape the seed expects.
    const SEED_PATH_LOCAL = SEED_PATH; // re-use the constant from top of file
    const seedRaw = readFileSync(SEED_PATH_LOCAL, "utf8");
    const seedFile = JSON.parse(seedRaw);
    const before = seedFile.entries.length;
    for (const c of promoted) {
      const { _discovery, ...rest } = c;
      seedFile.entries.push({
        ...rest,
        // tag the new entry so we can spot auto-discovered ones later
        tags: Array.from(
          new Set([...(rest.tags ?? []), "auto-discovered"]),
        ),
      });
    }
    writeFileSync(
      SEED_PATH_LOCAL,
      JSON.stringify(seedFile, null, 2) + "\n",
      "utf8",
    );
    console.log(
      `[ac-discover] auto-merged ${promoted.length} entries into seed (${before} → ${seedFile.entries.length}).`,
    );
    console.log("[ac-discover] sample of auto-merged:");
    for (const c of promoted.slice(0, 8)) {
      const tag = c._discovery?.stars
        ? `★${c._discovery.stars}`
        : `npm ${c._discovery?.weeklyDownloads}/wk`;
      console.log(`  + ${c.name.padEnd(30)} ${tag}`);
    }
    console.log(
      "[ac-discover] next: run `npm run build:agent-commerce` to score + merge.",
    );
    return;
  }
  console.log(
    `[ac-discover] (pass --auto-merge to promote candidates passing star/dl thresholds into seed-data.json)`,
  );
}

main().catch((err) => {
  console.error("[ac-discover] fatal:", err);
  process.exit(1);
});
