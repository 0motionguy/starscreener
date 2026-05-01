#!/usr/bin/env node
// Scrape curated "awesome-*" skill / agent / Claude lists for skill repos.
//
// MOTIVATION
//   The skill domain scorer (src/lib/pipeline/scoring/domain/skill.ts) has an
//   `inAwesomeLists` term worth 0.15 of the total weight. Today every
//   skill row defaults to undefined → the term contributes 0 to the score.
//   This collector populates the field by reverse-indexing the README
//   contents of a curated set of awesome-lists.
//
// ALGORITHM
//   1. Hardcoded list of awesome-* repos (extensible).
//   2. For each repo: fetch raw README.md from main, fall back to master.
//   3. Extract owner/repo links via the existing extractGithubRepoFullNames()
//      helper so we stay consistent with the other source scrapers.
//   4. Build a reverse index: { skillRepo: [awesomeList, ...] }
//   5. Dual-write to ss:data:v1:awesome-skills and data/awesome-skills.json.
//
// CADENCE
//   Awesome-lists drift on a multi-day cadence. 24h is plenty.
//
// FAILURE MODE
//   If 0 awesome-lists return a usable README, we still write an empty
//   payload — the leaderboard reader treats `awesome-skills` absent / empty
//   the same way (no inAwesomeLists contribution). Don't fail-loud here.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractGithubRepoFullNames, extractUnknownRepoCandidates } from "./_github-repo-links.mjs";
import { appendUnknownMentions } from "./_unknown-mentions-lake.mjs";
import { writeDataStore, closeDataStore } from "./_data-store-write.mjs";
import { writeSourceMetaFromOutcome } from "./_data-meta.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");
const OUT_PATH = resolve(DATA_DIR, "awesome-skills.json");

const USER_AGENT = "TrendingRepo-AwesomeSkills/1.0 (+https://trendingrepo.com)";
const README_TIMEOUT_MS = 15_000;
const SLEEP_BETWEEN_FETCHES_MS = 500;

// Curated awesome-* lists. Add more as they're discovered. Order is informational.
//
// Sources informed by the trending-engine plan §1a (awesome-claude-code,
// awesome-mcp variants) plus a couple of well-known Anthropic-skills lists.
// All confirmed public repos at time of writing (2026-04).
const AWESOME_LISTS = [
  "sickn33/antigravity-awesome-skills",
  "hesreallyhim/awesome-claude-code",
  "DSchau/awesome-claude",
  "punkpeye/awesome-mcp-servers",
  "wong2/awesome-mcp-servers",
];

function log(msg) {
  console.log(`[awesome-skills] ${msg}`);
}

async function fetchReadme(repoFullName) {
  const branches = ["main", "master"];
  for (const branch of branches) {
    const url = `https://raw.githubusercontent.com/${repoFullName}/${branch}/README.md`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), README_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/plain, text/markdown, */*",
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const text = await res.text();
        return { url, text, branch };
      }
      // 404 → try next branch. Anything else → bail this repo.
      if (res.status !== 404) {
        log(`  ${repoFullName}@${branch} → HTTP ${res.status}, skipping repo`);
        return null;
      }
    } catch (err) {
      clearTimeout(timer);
      log(`  ${repoFullName}@${branch} → ${err?.message ?? err}`);
      // network error → try next branch
    }
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const fetchedAt = new Date().toISOString();
  log(`scraping ${AWESOME_LISTS.length} awesome-lists`);

  // Reverse index: skill-repo (lowercased "owner/repo") → set of awesome-list slugs.
  const indexBySkill = new Map();
  const successfulLists = [];

  for (let i = 0; i < AWESOME_LISTS.length; i += 1) {
    const listRepo = AWESOME_LISTS[i];
    log(`fetching ${listRepo}`);
    const readme = await fetchReadme(listRepo);
    if (!readme) {
      log(`  no README found, skipping`);
      if (i < AWESOME_LISTS.length - 1) await sleep(SLEEP_BETWEEN_FETCHES_MS);
      continue;
    }

    // Extract every github.com/<owner>/<repo> link, dedupe via Set.
    const fullNames = extractGithubRepoFullNames(readme.text);
    let added = 0;
    for (const fullName of fullNames) {
      // Don't index the awesome-list itself.
      if (fullName === listRepo.toLowerCase()) continue;
      let listsForSkill = indexBySkill.get(fullName);
      if (!listsForSkill) {
        listsForSkill = new Set();
        indexBySkill.set(fullName, listsForSkill);
      }
      listsForSkill.add(listRepo);
      added += 1;
    }
    successfulLists.push(listRepo);
    log(`  + ${fullNames.size} repo links (${added} mappings)`);

    if (i < AWESOME_LISTS.length - 1) await sleep(SLEEP_BETWEEN_FETCHES_MS);
  }

  // Convert Map<string, Set<string>> → plain object for JSON serialization.
  const indexObj = {};
  for (const [skill, lists] of indexBySkill) {
    indexObj[skill] = [...lists];
  }

  const payload = {
    fetchedAt,
    source: "awesome-skills aggregate",
    lists: successfulLists,
    listsAttempted: AWESOME_LISTS,
    indexBySkill: indexObj,
    counts: {
      lists: successfulLists.length,
      listsAttempted: AWESOME_LISTS.length,
      uniqueSkills: indexBySkill.size,
    },
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
  const result = await writeDataStore("awesome-skills", payload);

  log(`wrote ${OUT_PATH} [redis: ${result.source}]`);
  log(`  ${payload.counts.uniqueSkills} unique skill repos across ${payload.counts.lists}/${payload.counts.listsAttempted} lists`);

  // F3 unknown-mentions lake — awesome-lists are pure discovery surfaces;
  // every github repo we found is a skill candidate by definition. Feed
  // them all to the lake for promotion-job triage. (Tracked-set check
  // happens downstream in the promotion job, not here.)
  if (indexBySkill.size > 0) {
    await appendUnknownMentions(
      Array.from(indexBySkill.keys(), (fullName) => ({ source: "awesome-skills", fullName })),
    );
    log(`  lake: ${indexBySkill.size} skill candidates → data/unknown-mentions.jsonl`);
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const isDirectRun = invokedPath
  ? fileURLToPath(import.meta.url) === invokedPath
  : false;

if (isDirectRun) {
  const startedAt = Date.now();
  main()
    .then(async () => {
      try {
        await writeSourceMetaFromOutcome({
          source: "awesome-skills",
          count: 1,
          durationMs: Date.now() - startedAt,
        });
      } catch (metaErr) {
        console.error("[meta] awesome-skills.json write failed:", metaErr);
      }
    })
    .catch(async (err) => {
      console.error("scrape-awesome-skills failed:", err.message ?? err);
      try {
        await writeSourceMetaFromOutcome({
          source: "awesome-skills",
          count: 0,
          durationMs: Date.now() - startedAt,
          error: err,
        });
      } catch (metaErr) {
        console.error(
          "[meta] awesome-skills.json error-write failed:",
          metaErr,
        );
      }
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDataStore();
    });
}

export { fetchReadme, AWESOME_LISTS };
