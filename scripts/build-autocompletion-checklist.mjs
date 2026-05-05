#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ROOT = process.cwd();
const PROFILES_FILE = resolve(ROOT, "data", "repo-profiles.json");
const OUT_FILE = resolve(ROOT, "data", "repo-autocompletion-checklist.json");

const CORE_FIELD_KEYS = [
  "fullName",
  "rank",
  "selectedFrom",
  "status",
  "lastProfiledAt",
  "surfaces.githubUrl",
  "websiteUrl",
  "websiteSource",
  "aisoScan",
];

const ENRICHED_FIELD_KEYS = [
  "surfaces.docsUrl",
  "surfaces.npmPackages",
  "surfaces.productHuntLaunchId",
  "nextScanAfter",
  "error",
  "surfaces",
];

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function getValue(input, path) {
  return path.split(".").reduce((acc, key) => {
    if (!acc || typeof acc !== "object") return undefined;
    return acc[key];
  }, input);
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function missingFields(profile, fields) {
  return fields.filter((field) => !hasValue(getValue(profile, field)));
}

function addMissingCounts(target, fields) {
  for (const field of fields) {
    target[field] = (target[field] ?? 0) + 1;
  }
}

function makeRow(profile) {
  const missingCore = missingFields(profile, CORE_FIELD_KEYS);
  const missingEnriched = missingFields(profile, ENRICHED_FIELD_KEYS);
  return {
    fullName: String(profile?.fullName ?? "").trim(),
    core_complete: missingCore.length === 0,
    enriched_complete: missingEnriched.length === 0,
    has_homepage:
      typeof profile?.websiteUrl === "string" && profile.websiteUrl.trim().length > 0,
    aiso_scan_complete: false,
    missing_core_fields: missingCore,
    missing_enriched_fields: missingEnriched,
  };
}

async function main() {
  const source = await readJson(PROFILES_FILE, { generatedAt: null, profiles: [] });
  const profiles = Array.isArray(source?.profiles) ? source.profiles : [];
  const rows = profiles
    .map(makeRow)
    .filter((row) => row.fullName.includes("/"))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const missingCoreCounts = {};
  const missingEnrichedCounts = {};
  for (const row of rows) {
    addMissingCounts(missingCoreCounts, row.missing_core_fields);
    addMissingCounts(missingEnrichedCounts, row.missing_enriched_fields);
  }

  const totalRepos = rows.length;
  const tickedOff = rows.filter(
    (row) => row.core_complete && row.enriched_complete && row.aiso_scan_complete,
  ).length;

  const payload = {
    source: "repo-profiles",
    sourceGeneratedAt: typeof source?.generatedAt === "string" ? source.generatedAt : null,
    sourceVersion: Number.isFinite(source?.version) ? source.version : null,
    stats: {
      totalRepos,
      tickedOff,
      completionRatio: totalRepos > 0 ? Number((tickedOff / totalRepos).toFixed(4)) : 0,
      missingCoreFieldCounts: missingCoreCounts,
      missingEnrichedFieldCounts: missingEnrichedCounts,
    },
    summary: {
      totalRepos,
      tickedOff,
      completionRatio: totalRepos > 0 ? Number((tickedOff / totalRepos).toFixed(4)) : 0,
    },
    fieldDefinitions: {
      core: CORE_FIELD_KEYS,
      enriched: ENRICHED_FIELD_KEYS,
    },
    repos: rows,
    rows,
  };

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(
    `repo-autocompletion-checklist: totalRepos=${totalRepos} tickedOff=${tickedOff}`,
  );
}

main().catch((error) => {
  console.error(`build-autocompletion-checklist failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
