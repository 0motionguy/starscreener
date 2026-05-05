import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const TRENDING_PATH = resolve(ROOT, "data", "trending.json");
const OUT_PATH = resolve(ROOT, "data", "repo-why.json");
const LIMIT = 50;

function repoWhyKey(owner, name) {
  return `repo:${owner.toLowerCase()}:${name.toLowerCase()}:why`;
}

function parseTopRows() {
  const raw = JSON.parse(readFileSync(TRENDING_PATH, "utf8"));
  const rows = raw?.buckets?.past_24_hours?.All;
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, LIMIT);
}

function inferSignal(row) {
  const text = `${row?.description ?? ""}`.toLowerCase();
  if (text.includes("release") || text.includes("changelog")) return "release";
  if (text.includes("hacker news") || text.includes("hn")) return "hackernews";
  if (text.includes("contributors") || text.includes("contributor")) return "contributor_surge";
  return "stars_velocity";
}

function buildLine(owner, name, row, signal) {
  const fullName = `${owner}/${name}`;
  const stars = Number(row?.stars ?? 0) || 0;
  switch (signal) {
    case "release":
      return `${fullName} is trending after a fresh release cycle and rapid developer pickup. It holds ${stars.toLocaleString("en-US")} stars in the current top-50 window.`;
    case "hackernews":
      return `${fullName} is trending on Hacker News-style developer attention and GitHub follow-through. It currently sits at ${stars.toLocaleString("en-US")} stars in this cycle.`;
    case "contributor_surge":
      return `${fullName} is trending on contributor momentum and sustained project activity. It currently tracks ${stars.toLocaleString("en-US")} stars in the live window.`;
    case "stars_velocity":
    default:
      return `${fullName} is trending on star-velocity acceleration in the last 24h leaderboard window. It currently sits at ${stars.toLocaleString("en-US")} stars with strong momentum.`;
  }
}

function main() {
  const rows = parseTopRows();
  const now = new Date().toISOString();
  const out = {};
  for (const row of rows) {
    const full = String(row?.repo_name ?? "");
    if (!full.includes("/")) continue;
    const [owner, name] = full.split("/");
    const signal = inferSignal(row);
    const key = repoWhyKey(owner, name);
    out[key] = {
      owner,
      name,
      fullName: `${owner}/${name}`,
      signal,
      line: buildLine(owner, name, row, signal),
      generatedAt: now,
    };
  }
  writeFileSync(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  console.log(`[agn-791] persisted why captions: ${Object.keys(out).length}/${LIMIT}`);
}

main();

