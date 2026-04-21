import { readFile } from "node:fs/promises";

function addFullName(out, raw) {
  if (typeof raw !== "string") return;
  const full = raw.trim();
  if (!full.includes("/")) return;
  const lower = full.toLowerCase();
  if (!out.has(lower)) out.set(lower, full);
}

export function recentRepoRows(recent) {
  if (Array.isArray(recent?.items)) return recent.items;
  if (Array.isArray(recent?.rows)) return recent.rows;
  if (Array.isArray(recent)) return recent;
  return [];
}

export function collectTrackedRepos({ trending, recent } = {}) {
  const tracked = new Map();

  for (const langMap of Object.values(trending?.buckets ?? {})) {
    for (const rows of Object.values(langMap ?? {})) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        addFullName(tracked, row?.repo_name ?? row?.fullName ?? row?.full_name);
      }
    }
  }

  for (const row of recentRepoRows(recent)) {
    addFullName(tracked, row?.repo_name ?? row?.fullName ?? row?.full_name);
  }

  return tracked;
}

export async function loadTrackedReposFromFiles({
  trendingPath,
  recentPath,
  log = () => {},
} = {}) {
  const payload = {};

  if (trendingPath) {
    try {
      payload.trending = JSON.parse(await readFile(trendingPath, "utf8"));
    } catch (err) {
      log(`warn: could not read trending.json - ${err.message}`);
    }
  }

  if (recentPath) {
    try {
      payload.recent = JSON.parse(await readFile(recentPath, "utf8"));
    } catch {
      // recent-repos.json is optional for social scrapers.
    }
  }

  return collectTrackedRepos(payload);
}
