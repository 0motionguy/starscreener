#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchJsonWithRetry, sleep } from "./_fetch-json.mjs";
import { writeDataStore, closeDataStore } from "./_data-store-write.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const FILE = resolve(ROOT, "data", "repo-metadata.json");
const CHECKLIST_FILE = resolve(ROOT, "data", "repo-autocompletion-checklist.json");

const LIMIT = clampInt(process.env.REPO_METADATA_MISSING_LIMIT ?? "20", 20, 1, 500);
const DELAY_MS = clampInt(process.env.REPO_METADATA_MISSING_DELAY_MS ?? "250", 250, 0, 5000);
const API_VERSION = "2022-11-28";

function clampInt(raw, fallback, min, max) {
  const n = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    if (err?.code === "ENOENT") return fallback;
    throw err;
  }
}

function hasCoreMissing(item) {
  if (!item || !item.fullName) return true;
  if (item.githubId == null) return true;
  if (!String(item.description ?? "").trim()) return true;
  if (!String(item.language ?? "").trim()) return true;
  if (!Array.isArray(item.topics) || item.topics.length === 0) return true;
  if (typeof item.stars !== "number") return true;
  if (typeof item.forks !== "number") return true;
  if (typeof item.openIssues !== "number") return true;
  if (!item.createdAt || !item.updatedAt || !item.pushedAt || !item.defaultBranch) return true;
  return false;
}

function checklistTargetRows() {
  return readJson(CHECKLIST_FILE, { rows: [] }).then((d) => {
    const rows = Array.isArray(d?.rows) ? d.rows : [];
    return rows
      .filter((r) => r && r.core_complete === false && typeof r.fullName === "string")
      .sort((a, b) => {
        const ta = Date.parse(a.lastCommitAt ?? "");
        const tb = Date.parse(b.lastCommitAt ?? "");
        if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return tb - ta;
        if (Number.isFinite(ta)) return -1;
        if (Number.isFinite(tb)) return 1;
        return String(a.fullName).localeCompare(String(b.fullName));
      });
  });
}

function splitFullName(fullName) {
  const [owner, name] = String(fullName).split("/");
  return { owner, name };
}

async function fetchRepo(fullName, token) {
  const { owner, name } = splitFullName(fullName);
  if (!owner || !name) throw new Error(`invalid fullName: ${fullName}`);
  const url = `https://api.github.com/repos/${owner}/${name}`;
  const repo = await fetchJsonWithRetry(url, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "trendingrepo-metadata-bot",
      "X-GitHub-Api-Version": API_VERSION,
    },
    attempts: 3,
    retryDelayMs: 1000,
    timeoutMs: 15000,
  });
  return repo;
}

async function fetchLatestRelease(fullName, token) {
  const { owner, name } = splitFullName(fullName);
  const url = `https://api.github.com/repos/${owner}/${name}/releases/latest`;
  try {
    return await fetchJsonWithRetry(url, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "trendingrepo-metadata-bot",
        "X-GitHub-Api-Version": API_VERSION,
      },
      attempts: 2,
      retryDelayMs: 600,
      timeoutMs: 12000,
    });
  } catch (err) {
    if (String(err?.message ?? "").includes("404")) return null;
    throw err;
  }
}

function normalizeRepo(repo, release, requestedFullName, fetchedAt) {
  const { owner, name } = splitFullName(requestedFullName);
  return {
    githubId: repo?.id ?? null,
    fullName: repo?.full_name ?? requestedFullName,
    name: repo?.name ?? name,
    owner: repo?.owner?.login ?? owner,
    ownerAvatarUrl: repo?.owner?.avatar_url ?? "",
    description: repo?.description ?? "",
    url: repo?.html_url ?? `https://github.com/${requestedFullName}`,
    homepageUrl: repo?.homepage || null,
    language: repo?.language ?? null,
    license: repo?.license?.spdx_id ?? null,
    topics: Array.isArray(repo?.topics) ? repo.topics.filter(Boolean) : [],
    stars: Number.isFinite(repo?.stargazers_count) ? repo.stargazers_count : 0,
    stargazersCount: Number.isFinite(repo?.stargazers_count) ? repo.stargazers_count : 0,
    forks: Number.isFinite(repo?.forks_count) ? repo.forks_count : 0,
    openIssues: Number.isFinite(repo?.open_issues_count) ? repo.open_issues_count : 0,
    createdAt: repo?.created_at ?? "",
    updatedAt: repo?.updated_at ?? "",
    pushedAt: repo?.pushed_at ?? "",
    lastReleaseAt: release?.published_at ?? null,
    latestReleaseTag: release?.tag_name ?? null,
    defaultBranch: repo?.default_branch ?? null,
    archived: Boolean(repo?.archived),
    disabled: Boolean(repo?.disabled),
    fork: Boolean(repo?.fork),
    fetchedAt,
  };
}

async function main() {
  const token = process.env.GITHUB_TOKEN ?? "";
  if (!token) throw new Error("GITHUB_TOKEN is required");

  const payload = await readJson(FILE, { fetchedAt: null, sourceCount: 0, items: [], failures: [] });
  const items = Array.isArray(payload.items) ? payload.items : [];
  const byName = new Map();
  for (let i = 0; i < items.length; i += 1) byName.set(String(items[i]?.fullName ?? "").toLowerCase(), i);
  const rows = await checklistTargetRows();
  const targets = [];
  for (const row of rows) {
    const idx = byName.get(String(row.fullName).toLowerCase());
    if (Number.isInteger(idx)) targets.push(idx);
    if (targets.length >= LIMIT) break;
  }
  const beforeMissing = items.filter((it) => hasCoreMissing(it)).length;

  const failures = [];
  let updated = 0;
  for (let i = 0; i < targets.length; i += 1) {
    const idx = targets[i];
    const current = items[idx];
    const fullName = current?.fullName;
    if (!fullName || !String(fullName).includes("/")) {
      failures.push({ index: idx, fullName: fullName ?? null, reason: "invalid-fullname" });
      continue;
    }

    try {
      const fetchedAt = new Date().toISOString();
      const repo = await fetchRepo(fullName, token);
      const release = await fetchLatestRelease(fullName, token);
      const next = normalizeRepo(repo, release, fullName, fetchedAt);
      items[idx] = next;
      updated += 1;
      console.log(`updated ${i + 1}/${targets.length}: ${fullName}`);
    } catch (err) {
      failures.push({ fullName, reason: "fetch-failed", error: String(err?.message ?? err) });
      console.warn(`failed ${i + 1}/${targets.length}: ${fullName} -> ${String(err?.message ?? err)}`);
    }

    if (DELAY_MS > 0) await sleep(DELAY_MS);
  }

  const finalPayload = {
    fetchedAt: new Date().toISOString(),
    sourceCount: items.length,
    items,
    failures,
    enrichment: {
      mode: "missing-core",
      requestedLimit: LIMIT,
      attempted: targets.length,
      updated,
      failed: failures.length,
      beforeMissing,
    },
  };

  const afterMissing = items.filter((it) => hasCoreMissing(it)).length;
  if (updated > 0) {
    await writeFile(FILE, JSON.stringify(finalPayload, null, 2) + "\n", "utf8");
    const redisResult = await writeDataStore("repo-metadata", finalPayload);
    console.log(
      `repo-metadata missing-core complete: updated=${updated} failed=${failures.length} beforeMissing=${beforeMissing} afterMissing=${afterMissing} [redis: ${redisResult?.source ?? "skipped"}]`,
    );
    return;
  }

  console.log(
    `repo-metadata missing-core complete: updated=0 failed=${failures.length} beforeMissing=${beforeMissing} afterMissing=${afterMissing} [redis: skipped]`,
  );
}

main()
  .catch((err) => {
    console.error("enrich-repo-metadata-missing-core failed:", err?.message ?? err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDataStore();
  });
