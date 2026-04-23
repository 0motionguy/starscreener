import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

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

export function manualRepoRows(manual) {
  if (Array.isArray(manual?.items)) return manual.items;
  if (Array.isArray(manual)) return manual;
  return [];
}

export function collectTrackedRepos({ trending, recent, manual } = {}) {
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

  for (const row of manualRepoRows(manual)) {
    addFullName(tracked, row?.repo_name ?? row?.fullName ?? row?.full_name);
  }

  return tracked;
}

function defaultManualJsonlPath(trendingPath) {
  const root = trendingPath ? resolve(dirname(trendingPath), "..") : process.cwd();
  const dataDir = process.env.STARSCREENER_DATA_DIR
    ? resolve(process.env.STARSCREENER_DATA_DIR)
    : resolve(root, ".data");
  return resolve(dataDir, "manual-repos.jsonl");
}

function parseJsonl(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export async function loadTrackedReposFromFiles({
  trendingPath,
  recentPath,
  manualPath,
  manualJsonlPath,
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

  const resolvedManualPath =
    manualPath ??
    (trendingPath ? resolve(dirname(trendingPath), "manual-repos.json") : null);
  if (resolvedManualPath) {
    try {
      payload.manual = JSON.parse(await readFile(resolvedManualPath, "utf8"));
    } catch {
      // data/manual-repos.json is optional.
    }
  }

  const resolvedManualJsonlPath =
    manualJsonlPath ?? defaultManualJsonlPath(trendingPath);
  try {
    const runtimeRows = parseJsonl(await readFile(resolvedManualJsonlPath, "utf8"));
    payload.manual = {
      ...(payload.manual ?? {}),
      items: [...manualRepoRows(payload.manual), ...runtimeRows],
    };
  } catch {
    // .data/manual-repos.jsonl is optional for CI and first-run local dev.
  }

  return collectTrackedRepos(payload);
}
