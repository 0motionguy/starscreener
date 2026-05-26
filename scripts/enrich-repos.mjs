// Evidence gatherer for the consensus backfill.
//
// For each target repo, collects REAL evidence used to synthesize an
// E-E-A-T-grade "why it's trending" report:
//   - GitHub API: full metadata + README excerpt (the Expertise + Experience
//     substrate — what the project actually is, first-hand from its own docs).
//   - Tavily web search: recent third-party context + citeable URLs (the
//     Authoritativeness + Trustworthiness substrate — who else is talking
//     about it, with links).
//
// Output: C:/tmp/enriched-repos.jsonl (one JSON object per repo, append-only,
// resumable). Synthesis happens in a separate step so we never re-pay for
// enrichment on a re-run.
//
// Keys come from .env.backfill.local (GITIGNORED). ROTATE after the job.
//
// Run:  node scripts/enrich-repos.mjs --list C:/tmp/target-500.json --limit 10 [--force]

import { readFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// ---- env ----
function loadEnv(path) {
  const env = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}
const ENV = loadEnv(".env.backfill.local");
const GH_POOL = (ENV.GH_TOKEN_POOL || "").split(",").filter(Boolean);
const TAVILY_POOL = (ENV.TAVILY_KEY_POOL || "").split(",").filter(Boolean);
let ghIdx = 0;
let tvIdx = 0;
const nextGh = () => GH_POOL[ghIdx++ % GH_POOL.length];
const nextTavily = () => TAVILY_POOL[tvIdx++ % TAVILY_POOL.length];

// ---- args ----
const args = process.argv.slice(2);
const getArg = (f, d) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const LIST = getArg("--list", "C:/tmp/target-500.json");
const LIMIT = parseInt(getArg("--limit", "999"), 10);
const OFFSET = parseInt(getArg("--offset", "0"), 10);
const OUT = getArg("--out", "C:/tmp/enriched-repos.jsonl");
const CONCURRENCY = parseInt(getArg("--concurrency", "6"), 10);

// Resume: skip fullNames already in OUT.
const done = new Set();
if (existsSync(OUT)) {
  for (const line of readFileSync(OUT, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      done.add(JSON.parse(line).fullName.toLowerCase());
    } catch {
      /* skip */
    }
  }
}

async function ghJson(path) {
  const r = await fetch(`https://api.github.com/${path}`, {
    headers: {
      "User-Agent": "trendingrepo-enrich",
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${nextGh()}`,
    },
  });
  if (!r.ok) return null;
  return r.json();
}

async function ghReadme(fullName) {
  try {
    const r = await fetch(`https://api.github.com/repos/${fullName}/readme`, {
      headers: {
        "User-Agent": "trendingrepo-enrich",
        Accept: "application/vnd.github.raw+json",
        Authorization: `Bearer ${nextGh()}`,
      },
    });
    if (!r.ok) return "";
    const text = await r.text();
    // Strip markdown noise → first ~900 chars of readable prose.
    const clean = text
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/[#>*_`|-]+/g, " ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    return clean.slice(0, 900);
  } catch {
    return "";
  }
}

async function tavily(query) {
  if (TAVILY_POOL.length === 0) return [];
  try {
    const r = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: nextTavily(),
        query,
        max_results: 4,
        search_depth: "basic",
        include_answer: false,
      }),
    });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.results || [])
      .map((x) => ({ title: (x.title || "").slice(0, 140), url: x.url, snippet: (x.content || "").slice(0, 280) }))
      .filter((x) => x.url);
  } catch {
    return [];
  }
}

async function enrichOne(fullName) {
  const meta = await ghJson(`repos/${fullName}`);
  const readme = await ghReadme(fullName);
  const name = fullName.split("/")[1] || fullName;
  // Search by project name + its lead topic/description keyword — slug-only
  // queries ("owner/name github") return nothing for most repos. Name +
  // domain term surfaces the actual coverage.
  const topicHint = (meta?.topics || [])[0]?.replace(/-/g, " ") || meta?.language || "";
  const descHint = (meta?.description || "").split(/[.,—-]/)[0].slice(0, 50);
  const web = await tavily(`${name} ${descHint || topicHint}`.trim().slice(0, 110));
  return {
    fullName,
    enrichedAt: new Date().toISOString(),
    gh: meta
      ? {
          description: meta.description || "",
          stars: meta.stargazers_count,
          forks: meta.forks_count,
          watchers: meta.subscribers_count,
          openIssues: meta.open_issues_count,
          language: meta.language,
          topics: meta.topics || [],
          homepage: meta.homepage || null,
          license: meta.license?.spdx_id || null,
          createdAt: meta.created_at,
          pushedAt: meta.pushed_at,
          archived: meta.archived,
          owner: meta.owner?.login || fullName.split("/")[0],
          ownerType: meta.owner?.type || null,
        }
      : null,
    readme,
    web,
  };
}

async function run() {
  const target = JSON.parse(readFileSync(LIST, "utf8"));
  const list = (target.list || []).slice(OFFSET, OFFSET + LIMIT);
  const queue = list.filter((fn) => !done.has(fn.toLowerCase()));
  console.log(
    `targets=${list.length} already-done=${list.length - queue.length} to-fetch=${queue.length} concurrency=${CONCURRENCY}`,
  );
  if (!existsSync(dirname(OUT))) mkdirSync(dirname(OUT), { recursive: true });

  let i = 0;
  let ok = 0;
  let fail = 0;
  const worker = async () => {
    while (queue.length > 0) {
      const fn = queue.shift();
      if (!fn) return;
      try {
        const rec = await enrichOne(fn);
        appendFileSync(OUT, JSON.stringify(rec) + "\n", "utf8");
        ok++;
      } catch (e) {
        appendFileSync(OUT, JSON.stringify({ fullName: fn, error: String(e).slice(0, 120) }) + "\n", "utf8");
        fail++;
      }
      if (++i % 20 === 0) console.log(`  …${i} processed (ok=${ok} fail=${fail})`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`DONE: ok=${ok} fail=${fail} → ${OUT}`);
}

run();
