#!/usr/bin/env node
// Live data fetcher for Agent Commerce.
//
// For each entry in seed-data.json:
//   - if links.github exists → fetch GitHub repo metadata (stars, forks, pushed_at, language, openIssues)
//   - always → fetch HN Algolia mentions (last 90d, story tag) for the entity name
//   - opportunistically → fetch npm weekly downloads when the github repo links to an npm package
//
// Output:  .data/agent-commerce-live-enrichment.json
//   { fetchedAt, results: [{ slug, github?, stars7dDelta?, hnMentions90d?, hnTopUrl?, ... }] }
//
// Then run `npm run build:agent-commerce` to re-derive composite scores from the live data.
//
// Flags:
//   --dry-run         don't write the enrichment file
//   --concurrency N   default 4
//   --timeout-ms N    default 8000
//   --skip-hn         skip HN mention fetches (only do GitHub)
//   --only-github     same as --skip-hn
//
// Auth:
//   GITHUB_TOKEN or GH_TOKEN env var → bearer auth (5000 req/hr).
//   Without it, public rate limit is 60/hr — this script paces itself but
//   still fails gracefully when 403 hits.

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

const SEED_PATH = resolve(
  process.cwd(),
  "apps/trendingrepo-worker/src/fetchers/agent-commerce/seed-data.json",
);
const OUT_PATH = resolve(
  process.cwd(),
  ".data/agent-commerce-live-enrichment.json",
);

const DRY_RUN = process.argv.includes("--dry-run");
const SKIP_HN =
  process.argv.includes("--skip-hn") || process.argv.includes("--only-github");
const CONCURRENCY = parseNumberArg("--concurrency", 4);
const TIMEOUT_MS = parseNumberArg("--timeout-ms", 8000);
const TOKEN =
  process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";

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
      const reset = res.headers.get("x-ratelimit-reset");
      return {
        ok: false,
        status: res.status,
        rateLimited: true,
        reset: reset ? Number(reset) : null,
      };
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

async function fetchGithubRepo(fullName) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "TrendingRepo-AC-Live/0.1",
  };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  return fetchJson(`https://api.github.com/repos/${fullName}`, { headers });
}

async function fetchHnMentions(query) {
  if (SKIP_HN) return { ok: false, skipped: true };
  const since = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);
  const url =
    `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}` +
    `&tags=story&numericFilters=created_at_i%3E${since}&hitsPerPage=20`;
  return fetchJson(url, {
    headers: { "User-Agent": "TrendingRepo-AC-Live/0.1" },
  });
}

async function fetchNpmRegistry(name) {
  // npm package metadata (returns 404 if not a real package).
  const safe = encodeURIComponent(name).replace(/%2F/g, "/");
  return fetchJson(`https://registry.npmjs.org/${safe}`, {
    headers: { "User-Agent": "TrendingRepo-AC-Live/0.1" },
  });
}

async function fetchNpmDownloads(name) {
  // Weekly downloads for a known package.
  const safe = encodeURIComponent(name).replace(/%2F/g, "/");
  return fetchJson(`https://api.npmjs.org/downloads/point/last-week/${safe}`, {
    headers: { "User-Agent": "TrendingRepo-AC-Live/0.1" },
  });
}

function npmCandidatesFor(entry) {
  const slug = slugify(entry.name);
  const out = new Set();
  // Slugified name is the most likely match.
  out.add(slug);
  // Strip "-mcp" / " mcp" tails since many MCP servers publish under the bare name.
  out.add(slug.replace(/-mcp(-server)?$/, ""));
  // For scoped package names from the GitHub repo path.
  if (entry.links?.github) {
    const [owner, repo] = entry.links.github.split("/");
    if (repo) out.add(repo.toLowerCase());
    if (owner) out.add(`@${owner.toLowerCase()}/${repo?.toLowerCase()}`);
  }
  return Array.from(out).filter((c) => c.length > 1);
}

function pushVelocityProxy(stargazers, pushedAt) {
  if (!Number.isFinite(stargazers) || stargazers <= 0) return 0;
  if (!pushedAt) return 0;
  const ageDays = (Date.now() - new Date(pushedAt).getTime()) / 86_400_000;
  const factor = Math.exp(-Math.max(0, ageDays) / 30);
  return Math.round(stargazers * factor * 0.05);
}

async function processEntry(entry, idx) {
  const slug = slugify(entry.name);
  const out = { slug, name: entry.name };

  // GitHub repo metadata
  if (entry.links?.github) {
    const gh = await fetchGithubRepo(entry.links.github);
    if (gh.ok) {
      const d = gh.data;
      out.github = {
        full_name: d.full_name,
        stars: d.stargazers_count,
        forks: d.forks_count,
        openIssues: d.open_issues_count,
        pushedAt: d.pushed_at,
        updatedAt: d.updated_at,
        defaultBranch: d.default_branch,
        language: d.language ?? null,
      };
      out.stars7dDelta = pushVelocityProxy(d.stargazers_count, d.pushed_at);
    } else if (gh.rateLimited) {
      out.githubError = "rate_limited";
    } else {
      out.githubError = gh.status ?? gh.error ?? "unknown";
    }
  }

  // HN mentions
  const hn = await fetchHnMentions(entry.name);
  if (hn.ok) {
    const hits = hn.data?.hits ?? [];
    out.hnMentions90d = hits.length;
    if (hits.length > 0 && hits[0]?.objectID) {
      out.hnTopUrl = `https://news.ycombinator.com/item?id=${hits[0].objectID}`;
    }
  } else if (!hn.skipped) {
    out.hnError = hn.status ?? hn.error ?? "unknown";
  }

  // npm — try a small set of likely package names; first hit wins.
  for (const candidate of npmCandidatesFor(entry)) {
    const meta = await fetchNpmRegistry(candidate);
    if (!meta.ok) continue;
    const dl = await fetchNpmDownloads(candidate);
    out.npm = {
      name: candidate,
      latestVersion: meta.data?.["dist-tags"]?.latest ?? null,
      weeklyDownloads: dl.ok ? (dl.data?.downloads ?? null) : null,
      registryUrl: `https://www.npmjs.com/package/${candidate.replace(/^@/, "%40")}`,
    };
    break;
  }

  return out;
}

async function main() {
  const seedRaw = readFileSync(SEED_PATH, "utf8");
  const seed = JSON.parse(seedRaw);
  const total = seed.entries.length;

  console.log(
    `[ac-live] enriching ${total} entities — concurrency=${CONCURRENCY}, ` +
      `timeout=${TIMEOUT_MS}ms, github_token=${TOKEN ? "yes" : "no"}, ` +
      `hn=${SKIP_HN ? "skip" : "yes"}`,
  );

  const results = new Array(total);
  let cursor = 0;
  let okCount = 0;
  let rateLimited = false;

  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < total) {
      const idx = cursor++;
      const entry = seed.entries[idx];
      try {
        const out = await processEntry(entry, idx);
        results[idx] = out;
        if (out.github || out.hnMentions90d != null) okCount++;
        if (out.githubError === "rate_limited") rateLimited = true;
        const tags = [];
        if (out.github)
          tags.push(`★${out.github.stars}`);
        if (typeof out.stars7dDelta === "number")
          tags.push(`Δ${out.stars7dDelta}/wk`);
        if (out.hnMentions90d != null)
          tags.push(`hn:${out.hnMentions90d}`);
        if (out.npm?.weeklyDownloads != null)
          tags.push(`npm:${out.npm.weeklyDownloads.toLocaleString("en-US")}/wk`);
        else if (out.npm?.name) tags.push(`npm:${out.npm.name}`);
        if (out.githubError) tags.push(`gh-err:${out.githubError}`);
        const status = out.github || out.hnMentions90d != null ? "✓" : "·";
        console.log(`  ${status} ${entry.name.padEnd(28)} ${tags.join(" ")}`);
      } catch (err) {
        results[idx] = { slug: slugify(entry.name), name: entry.name, error: String(err) };
        console.log(`  ✗ ${entry.name} (${err})`);
      }
    }
  });

  await Promise.all(workers);

  const fetchedAt = new Date().toISOString();
  const enrichment = { fetchedAt, total, ok: okCount, results };

  console.log("");
  console.log(
    `[ac-live] enriched=${okCount}/${total}` +
      (rateLimited ? " · GitHub rate-limited (set GITHUB_TOKEN to lift to 5000/hr)" : ""),
  );

  if (DRY_RUN) {
    console.log("[ac-live] --dry-run — nothing written.");
    return;
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(enrichment, null, 2), "utf8");
  console.log(`[ac-live] wrote enrichment to ${OUT_PATH}`);
  console.log("[ac-live] next: run `npm run build:agent-commerce` to re-derive scores.");
}

main().catch((err) => {
  console.error("[ac-live] fatal:", err);
  process.exit(1);
});
