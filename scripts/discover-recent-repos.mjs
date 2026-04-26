#!/usr/bin/env node
// Discover high-signal newly created GitHub repos so the "New" tab can show
// fresh launches before OSSInsights' trending SQL admits repos older than 1 day.
//
// This is deliberately narrow:
// - GitHub Search, not "all new repos on GitHub"
// - recent windows only (1d / 3d / 7d)
// - star thresholds to suppress low-signal noise

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchJsonWithRetry } from "./_fetch-json.mjs";
import { writeDataStore } from "./_data-store-write.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = resolve(__dirname, "..", "data", "recent-repos.json");

const API_URL = "https://api.github.com/search/repositories";
const API_VERSION = "2022-11-28";
const PER_PAGE = 100;
const MAX_ITEMS = 120;
const WINDOWS = [
  { days: 1, minStars: 5, pages: 2 },
  { days: 3, minStars: 20, pages: 2 },
  { days: 7, minStars: 60, pages: 1 },
];

function isoDateDaysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function buildQuery(window) {
  const createdFrom = isoDateDaysAgo(window.days);
  return [
    `created:>=${createdFrom}`,
    `stars:>=${window.minStars}`,
    "archived:false",
    "fork:false",
  ].join(" ");
}

function requestHeaders(token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
    "User-Agent": "starscreener-discovery-bot",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function normalizeRepo(item) {
  return {
    githubId: item.id,
    fullName: item.full_name,
    name: item.name,
    owner: item.owner?.login ?? "",
    ownerAvatarUrl: item.owner?.avatar_url ?? "",
    description: item.description ?? "",
    url: item.html_url,
    language: item.language ?? null,
    topics: Array.isArray(item.topics) ? item.topics : [],
    stars: item.stargazers_count ?? 0,
    forks: item.forks_count ?? 0,
    openIssues: item.open_issues_count ?? 0,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    pushedAt: item.pushed_at,
  };
}

async function fetchSearchWindow(window, token) {
  const rows = [];
  const query = buildQuery(window);

  for (let page = 1; page <= window.pages; page += 1) {
    const url = new URL(API_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("sort", "stars");
    url.searchParams.set("order", "desc");
    url.searchParams.set("per_page", String(PER_PAGE));
    url.searchParams.set("page", String(page));

    let body;
    try {
      body = await fetchJsonWithRetry(url, {
        headers: requestHeaders(token),
        attempts: 3,
        retryDelayMs: 1000,
        timeoutMs: 15_000,
      });
    } catch (err) {
      throw new Error(
        `GitHub search failed (${window.days}d page ${page}): ${err.message}`,
      );
    }

    const items = Array.isArray(body.items) ? body.items : [];
    for (const item of items) {
      if (!item?.full_name || !item.full_name.includes("/")) continue;
      if (item.archived || item.disabled) continue;
      rows.push(normalizeRepo(item));
    }

    if (items.length < PER_PAGE) break;
  }

  return rows;
}

async function main() {
  const token = process.env.GITHUB_TOKEN ?? "";
  const fetchedAt = new Date().toISOString();
  const deduped = new Map();

  for (const window of WINDOWS) {
    const rows = await fetchSearchWindow(window, token);
    console.log(
      `ok  github recent repos / ${window.days}d / stars>=${window.minStars} - ${rows.length} rows`,
    );
    for (const row of rows) {
      const key = row.fullName.toLowerCase();
      const existing = deduped.get(key);
      if (!existing) {
        deduped.set(key, row);
        continue;
      }

      const existingCreated = Date.parse(existing.createdAt);
      const nextCreated = Date.parse(row.createdAt);
      if (
        nextCreated > existingCreated ||
        (nextCreated === existingCreated && row.stars > existing.stars)
      ) {
        deduped.set(key, row);
      }
    }
  }

  const items = Array.from(deduped.values())
    .sort((a, b) => {
      const createdDelta = Date.parse(b.createdAt) - Date.parse(a.createdAt);
      if (createdDelta !== 0) return createdDelta;
      return b.stars - a.stars;
    })
    .slice(0, MAX_ITEMS);

  const payload = { fetchedAt, items };

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(payload, null, 2) + "\n", "utf8");

  // Dual-write: also push to data-store so live readers see fresh data
  // without waiting for a deploy.
  const result = await writeDataStore("recent-repos", payload);

  console.log(`wrote ${OUT_FILE} (${items.length} rows) [redis: ${result.source}]`);
}

main().catch((err) => {
  console.error("discover-recent-repos failed:", err.message ?? err);
  process.exit(1);
});
