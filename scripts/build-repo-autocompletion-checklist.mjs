#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { writeDataStore } from "./_data-store-write.mjs";

const ROOT = process.cwd();
const METADATA_FILE = resolve(ROOT, "data", "repo-metadata.json");
const OUT_FILE = resolve(ROOT, "data", "repo-autocompletion-checklist.json");

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function normalizeProfile(profile) {
  const fullName = String(profile?.fullName ?? "").trim();
  const description = typeof profile?.description === "string" ? profile.description.trim() : "";
  const topics = Array.isArray(profile?.topics) ? profile.topics.filter(Boolean) : [];
  const license = profile?.license ?? null;
  const defaultBranch = typeof profile?.defaultBranch === "string" ? profile.defaultBranch.trim() : "";
  const homepage =
    typeof profile?.homepageUrl === "string" && profile.homepageUrl.trim().length > 0
      ? profile.homepageUrl.trim()
      : null;
  const lastCommitAt = typeof profile?.pushedAt === "string" ? profile.pushedAt : null;
  const lastReleaseAt = typeof profile?.lastReleaseAt === "string" ? profile.lastReleaseAt : null;
  const latestReleaseTag =
    typeof profile?.latestReleaseTag === "string" ? profile.latestReleaseTag : null;
  const archived = Boolean(profile?.archived);
  const disabled = Boolean(profile?.disabled);
  const stargazersCount =
    typeof profile?.stars === "number"
      ? profile.stars
      : typeof profile?.stargazersCount === "number"
        ? profile.stargazersCount
        : null;

  const items = {
    description,
    topics,
    license,
    defaultBranch,
    homepage,
    lastCommitAt,
    lastReleaseAt,
    latestReleaseTag,
    archived,
    disabled,
    stargazersCount,
  };

  return { fullName, items, lastCommitAt };
}

function buildChecklistRow(profile) {
  const missingCoreFields = [];
  if (!profile.items.description) missingCoreFields.push("description");
  if (!Array.isArray(profile.items.topics) || profile.items.topics.length === 0) {
    missingCoreFields.push("topics");
  }
  if (!profile.items.defaultBranch) missingCoreFields.push("defaultBranch");
  if (profile.items.stargazersCount == null) missingCoreFields.push("stargazersCount");
  if (!profile.items.lastCommitAt) missingCoreFields.push("lastCommitAt");
  if (!profile.items.homepage) missingCoreFields.push("homepage");
  if (!Object.prototype.hasOwnProperty.call(profile.items, "license")) {
    missingCoreFields.push("license");
  }
  if (!Object.prototype.hasOwnProperty.call(profile.items, "lastReleaseAt")) {
    missingCoreFields.push("lastReleaseAt");
  }
  if (!Object.prototype.hasOwnProperty.call(profile.items, "latestReleaseTag")) {
    missingCoreFields.push("latestReleaseTag");
  }

  return {
    fullName: profile.fullName,
    core_complete: missingCoreFields.length === 0,
    enriched_complete: true,
    aiso_scan_complete: true,
    lastCommitAt: profile.lastCommitAt,
    missing_core_fields: missingCoreFields,
    items: profile.items,
  };
}

async function main() {
  const input = await readJson(METADATA_FILE, { fetchedAt: null, sourceCount: 0, items: [] });
  const profiles = Array.isArray(input?.items) ? input.items : [];
  const rows = profiles
    .map(normalizeProfile)
    .filter((profile) => profile.fullName.includes("/"))
    .map(buildChecklistRow)
    .sort((a, b) => {
      const ta = Date.parse(a.lastCommitAt ?? "");
      const tb = Date.parse(b.lastCommitAt ?? "");
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return tb - ta;
      if (Number.isFinite(ta)) return -1;
      if (Number.isFinite(tb)) return 1;
      return a.fullName.localeCompare(b.fullName);
    });

  const tickedOff = rows.filter(
    (row) => row.core_complete && row.enriched_complete && row.aiso_scan_complete,
  ).length;
  const totalRepos = rows.length;

  const payload = {
    source: "repo-metadata",
    sourceGeneratedAt: typeof input?.fetchedAt === "string" ? input.fetchedAt : null,
    sourceVersion: Number.isFinite(input?.sourceCount) ? input.sourceCount : null,
    summary: {
      tickedOff,
      totalRepos,
      completionRatio:
        totalRepos > 0 ? Number((tickedOff / totalRepos).toFixed(4)) : 0,
    },
    rows,
  };

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await writeDataStore("repo-autocompletion-checklist", payload);

  console.log(
    `repo-autocompletion-checklist: tickedOff=${tickedOff} totalRepos=${totalRepos}`,
  );
}

main().catch((error) => {
  console.error(`build-repo-autocompletion-checklist failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
