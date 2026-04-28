#!/usr/bin/env node
// Hydrate lifetime GitHub repo metadata for every repo discovered by the fast
// OSSInsights/recent-repo feeds. OSSInsights period "stars" are growth counts;
// this snapshot supplies all-time stargazers, forks, issues, topics, and dates.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchJsonWithRetry } from "./_fetch-json.mjs";
import { writeDataStore } from "./_data-store-write.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TRENDING_FILE = resolve(ROOT, "data", "trending.json");
const RECENT_REPOS_FILE = resolve(ROOT, "data", "recent-repos.json");
const MANUAL_REPOS_FILE = resolve(ROOT, "data", "manual-repos.json");
const RUNTIME_MANUAL_REPOS_FILE = resolve(ROOT, ".data", "manual-repos.jsonl");
const OUT_FILE = resolve(ROOT, "data", "repo-metadata.json");

const GRAPHQL_URL = "https://api.github.com/graphql";
const API_VERSION = "2022-11-28";
const BATCH_SIZE = Math.max(
  1,
  Math.min(50, Number.parseInt(process.env.REPO_METADATA_BATCH_SIZE ?? "25", 10) || 25),
);

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    if (err && err.code === "ENOENT") return fallback;
    throw err;
  }
}

async function readJsonl(file) {
  try {
    const raw = await readFile(file, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (err) {
    if (err && err.code === "ENOENT") return [];
    throw err;
  }
}

function addFullName(out, raw) {
  const fullName = String(raw ?? "").trim();
  if (!fullName || !fullName.includes("/")) return;
  const [owner, name] = fullName.split("/");
  if (!owner || !name) return;
  out.set(fullName.toLowerCase(), fullName);
}

function collectFullNames(trending, recentRepos, manualRepos, runtimeManualRepos) {
  const names = new Map();

  for (const periodBuckets of Object.values(trending?.buckets ?? {})) {
    for (const rows of Object.values(periodBuckets ?? {})) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows) addFullName(names, row?.repo_name);
    }
  }

  for (const row of recentRepos?.items ?? []) {
    addFullName(names, row?.fullName);
  }

  for (const row of manualRepos?.items ?? []) {
    addFullName(names, row?.fullName);
  }

  for (const row of runtimeManualRepos ?? []) {
    addFullName(names, row?.fullName);
  }

  return Array.from(names.values()).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase()),
  );
}

function buildPreviousIndex(previous) {
  const map = new Map();
  for (const item of previous?.items ?? []) {
    if (item?.fullName) map.set(String(item.fullName).toLowerCase(), item);
  }
  return map;
}

function splitFullName(fullName) {
  const slash = fullName.indexOf("/");
  return {
    owner: fullName.slice(0, slash),
    name: fullName.slice(slash + 1),
  };
}

function buildBatchQuery(batch) {
  const variableDefs = [];
  const fields = [];
  const variables = {};

  batch.forEach((fullName, i) => {
    const { owner, name } = splitFullName(fullName);
    variableDefs.push(`$owner${i}: String!`, `$name${i}: String!`);
    variables[`owner${i}`] = owner;
    variables[`name${i}`] = name;
    fields.push(`
      r${i}: repository(owner: $owner${i}, name: $name${i}) {
        databaseId
        name
        nameWithOwner
        owner {
          login
          avatarUrl
        }
        description
        url
        homepageUrl
        primaryLanguage {
          name
        }
        repositoryTopics(first: 20) {
          nodes {
            topic {
              name
            }
          }
        }
        stargazerCount
        forkCount
        issues(states: OPEN) {
          totalCount
        }
        createdAt
        updatedAt
        pushedAt
        defaultBranchRef {
          name
        }
        isArchived
        isDisabled
        isFork
      }`);
  });

  return {
    query: `query RepoMetadata(${variableDefs.join(", ")}) {${fields.join("\n")}\n}`,
    variables,
  };
}

async function fetchBatch(batch, token) {
  const payload = buildBatchQuery(batch);
  let body;
  try {
    body = await fetchJsonWithRetry(GRAPHQL_URL, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "trendingrepo-metadata-bot",
        "X-GitHub-Api-Version": API_VERSION,
      },
      body: JSON.stringify(payload),
      attempts: 3,
      retryDelayMs: 1000,
      timeoutMs: 15_000,
    });
  } catch (err) {
    throw new Error(`GitHub GraphQL metadata fetch failed: ${err.message}`);
  }

  return {
    data: body?.data ?? {},
    errors: Array.isArray(body?.errors) ? body.errors : [],
  };
}

function normalizeRepo(node, requestedFullName, fetchedAt) {
  const { owner: requestedOwner, name: requestedName } = splitFullName(requestedFullName);
  const topics = node.repositoryTopics?.nodes
    ?.map((entry) => entry?.topic?.name)
    .filter(Boolean) ?? [];

  return {
    githubId: node.databaseId ?? null,
    fullName: node.nameWithOwner ?? requestedFullName,
    name: node.name ?? requestedName,
    owner: node.owner?.login ?? requestedOwner,
    ownerAvatarUrl: node.owner?.avatarUrl ?? "",
    description: node.description ?? "",
    url: node.url ?? `https://github.com/${requestedFullName}`,
    homepageUrl: node.homepageUrl || null,
    language: node.primaryLanguage?.name ?? null,
    topics,
    stars: node.stargazerCount ?? 0,
    forks: node.forkCount ?? 0,
    openIssues: node.issues?.totalCount ?? 0,
    createdAt: node.createdAt ?? "",
    updatedAt: node.updatedAt ?? "",
    pushedAt: node.pushedAt ?? "",
    defaultBranch: node.defaultBranchRef?.name ?? null,
    archived: Boolean(node.isArchived),
    disabled: Boolean(node.isDisabled),
    fork: Boolean(node.isFork),
    fetchedAt,
  };
}

async function main() {
  const token = process.env.GITHUB_TOKEN ?? "";
  if (!token) {
    throw new Error("GITHUB_TOKEN is required to refresh data/repo-metadata.json");
  }

  const [trending, recentRepos, manualRepos, runtimeManualRepos, previous] =
    await Promise.all([
      readJson(TRENDING_FILE, {}),
      readJson(RECENT_REPOS_FILE, {}),
      readJson(MANUAL_REPOS_FILE, { fetchedAt: null, items: [] }),
      readJsonl(RUNTIME_MANUAL_REPOS_FILE),
      readJson(OUT_FILE, { fetchedAt: null, items: [], failures: [] }),
    ]);
  const previousByName = buildPreviousIndex(previous);
  const fetchedAt = new Date().toISOString();
  const fullNames = collectFullNames(
    trending,
    recentRepos,
    manualRepos,
    runtimeManualRepos,
  );
  const itemsByName = new Map();
  const failures = [];

  for (let offset = 0; offset < fullNames.length; offset += BATCH_SIZE) {
    const batch = fullNames.slice(offset, offset + BATCH_SIZE);
    const batchNo = Math.floor(offset / BATCH_SIZE) + 1;
    const batchTotal = Math.ceil(fullNames.length / BATCH_SIZE);

    try {
      const { data, errors } = await fetchBatch(batch, token);
      if (errors.length > 0) {
        console.warn(`warn metadata batch ${batchNo}/${batchTotal}: ${errors.length} GraphQL errors`);
      }

      batch.forEach((fullName, i) => {
        const node = data[`r${i}`];
        const key = fullName.toLowerCase();
        if (node) {
          itemsByName.set(key, normalizeRepo(node, fullName, fetchedAt));
          return;
        }

        const previousItem = previousByName.get(key);
        if (previousItem) {
          itemsByName.set(key, previousItem);
        }
        failures.push({
          fullName,
          reason: previousItem ? "not-found-kept-previous" : "not-found",
        });
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      for (const fullName of batch) {
        const key = fullName.toLowerCase();
        const previousItem = previousByName.get(key);
        if (previousItem) {
          itemsByName.set(key, previousItem);
        }
        failures.push({
          fullName,
          reason: previousItem ? "batch-failed-kept-previous" : "batch-failed",
          error: message,
        });
      }
    }

    console.log(`ok  metadata batch ${batchNo}/${batchTotal} - ${batch.length} repos`);
  }

  const items = Array.from(itemsByName.values()).sort((a, b) =>
    a.fullName.toLowerCase().localeCompare(b.fullName.toLowerCase()),
  );

  const payload = {
    fetchedAt,
    sourceCount: fullNames.length,
    items,
    failures,
  };

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(payload, null, 2) + "\n", "utf8");

  // Dual-write: also push to data-store so live readers see fresh data
  // without waiting for a deploy. Throws if Redis is configured but
  // unreachable — workflow goes red, operator notices.
  const result = await writeDataStore("repo-metadata", payload);

  console.log(
    `wrote ${OUT_FILE} (${items.length}/${fullNames.length} repos, ${failures.length} failures) [redis: ${result.source}]`,
  );
}

main().catch((err) => {
  console.error("fetch-repo-metadata failed:", err.message ?? err);
  process.exit(1);
});
