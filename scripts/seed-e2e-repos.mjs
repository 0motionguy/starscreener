#!/usr/bin/env node
// Seed the minimal repo rows required by the Playwright smoke suite.
//
// CI does not carry the production `.data/repos.jsonl` volume, but the smoke
// tests intentionally exercise mature repos that may no longer appear in the
// committed trending snapshots. Keep this deterministic and local: no GitHub
// API calls, no secrets, no data refresh.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATA_DIR = path.resolve(
  ROOT,
  process.env.TRENDINGREPO_DATA_DIR ??
    process.env.STARSCREENER_DATA_DIR ??
    ".data",
);
const REPOS_FILE = path.join(DATA_DIR, "repos.jsonl");

const now = "2026-04-28T00:00:00.000Z";

function repo(fullName, description, stars, topics, language = "TypeScript") {
  const [owner, name] = fullName.split("/");
  return {
    id: fullName.replace("/", "--"),
    fullName,
    name,
    owner,
    ownerAvatarUrl: `https://github.com/${owner}.png`,
    description,
    url: `https://github.com/${fullName}`,
    language,
    topics,
    categoryId: "web-frameworks",
    stars,
    forks: 0,
    contributors: 0,
    openIssues: 0,
    lastCommitAt: now,
    lastReleaseAt: null,
    lastReleaseTag: null,
    createdAt: "2016-01-01T00:00:00.000Z",
    starsDelta24h: 0,
    starsDelta7d: 0,
    starsDelta30d: 0,
    forksDelta7d: 0,
    contributorsDelta30d: 0,
    hasMovementData: false,
    momentumScore: 0,
    movementStatus: "stable",
    rank: 0,
    categoryRank: 0,
    sparklineData: Array.from({ length: 30 }, () => stars),
    socialBuzzScore: 0,
    mentionCount24h: 0,
    archived: false,
    deleted: false,
    tags: topics,
  };
}

const fixtures = [
  repo(
    "vercel/next.js",
    "The React framework for production.",
    132000,
    ["react", "nextjs", "framework", "web"],
  ),
  repo(
    "facebook/react",
    "The library for web and native user interfaces.",
    240000,
    ["react", "javascript", "ui", "frontend"],
    "JavaScript",
  ),
];

mkdirSync(DATA_DIR, { recursive: true });

const existing = new Map();
if (existsSync(REPOS_FILE)) {
  const raw = readFileSync(REPOS_FILE, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (typeof parsed?.fullName === "string") {
        existing.set(parsed.fullName.toLowerCase(), parsed);
      }
    } catch {
      // Preserve bad rows by leaving them out of the deterministic e2e seed.
    }
  }
}

for (const item of fixtures) {
  existing.set(item.fullName.toLowerCase(), item);
}

const lines = [...existing.values()]
  .sort((a, b) => a.fullName.localeCompare(b.fullName))
  .map((item) => JSON.stringify(item));

writeFileSync(REPOS_FILE, `${lines.join("\n")}\n`, "utf8");
console.log(`[seed-e2e-repos] wrote ${fixtures.length} smoke repos to ${REPOS_FILE}`);
