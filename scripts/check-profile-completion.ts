#!/usr/bin/env tsx

// Profile Completion Check.
//
// Server-side audit that scores every repo's profile completeness and writes
// a prioritized fix queue. Consumed by:
//   - sweep-cross-source-mentions.mts (--queue)  → re-fetch mentions for
//     under-scanned repos
//   - enrich-repo-profiles.mjs (--queue)         → re-enrich repos missing
//     description/language/topics
//
// Score formula (0-100, threshold "incomplete" < 70):
//   30 pts — required fields    (5 each: description, language, topics,
//                                  stars, momentumScore, lastCommitAt)
//   30 pts — mention coverage    (min(socialFiring, 5) / 5 * 30, where
//                                  socialFiring = count of platforms with
//                                  count7d > 0 in mentions.perSource)
//   20 pts — delta freshness     (20 * (3 - missingCount) / 3 from the
//                                  starsDelta*Missing flags)
//   20 pts — optional enrichment (5 each: profile.status==='scanned';
//                                  aisoScan.status==='completed';
//                                  lastReleaseAt||lastReleaseTag;
//                                  mentions.total7d >= 3)
//
// Output: data/profile-completion-queue.json + Redis slug 'profile-completion-queue'.
//
// Usage:
//   npm run check:profile-completion -- --mode top          (default, top 100)
//   npm run check:profile-completion -- --mode catchup      (full ~5000 corpus)
//   npm run check:profile-completion -- --dry-run           (audit only, no write)
//   npm run check:profile-completion -- --threshold 70      (override score cutoff)
//
// Env: tsx --env-file-if-exists=.env.local handles .env.local loading.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { writeDataStore, closeDataStore } from "./_data-store-write.mjs";
import { writeSourceMeta } from "./_data-meta.mjs";
import { getDerivedRepos } from "@/lib/derived-repos";
import type { Repo, SocialPlatform } from "@/lib/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT, "data");
const PROFILES_FILE = resolve(DATA_DIR, "repo-profiles.json");
const OUT_FILE = resolve(DATA_DIR, "profile-completion-queue.json");

// 11 social/source platforms tracked in `mentions.perSource` (matches
// CompletenessStrip.SOURCES — kept in sync deliberately).
const SOCIAL_PLATFORMS: ReadonlyArray<Exclude<SocialPlatform, "github">> = [
  "twitter",
  "reddit",
  "hackernews",
  "bluesky",
  "devto",
  "lobsters",
  "producthunt",
  "npm",
  "huggingface",
  "arxiv",
  "funding",
];

// Coverage cap: a repo firing on 5+ platforms in 7d is "well-covered".
// Diminishing returns above 5; matches the existing 5-channel cross-signal
// fusion already in the codebase (decorateWithCrossSignal).
const COVERAGE_CAP = 5;

// Default threshold below which a repo is flagged "incomplete".
const DEFAULT_THRESHOLD = 70;

// "underScanned" trigger: a repo is sweep-eligible if 6+ of 11 platforms
// have zero 7d mentions. That's "more than half silent" — strong signal
// that a per-repo probe might surface mentions we haven't found yet.
const UNDER_SCANNED_TRIGGER = 6;

// Anti-oscillation window: the sweep + enrich consumers honor this when
// reading the queue. Repos with `lastSweptAt` within 6h are skipped.
const ANTI_OSC_HOURS = 6;

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

type Mode = "top" | "catchup";

interface Options {
  mode: Mode;
  topN: number;
  threshold: number;
  dryRun: boolean;
  json: boolean;
}

function usage(): string {
  return [
    "usage: npm run check:profile-completion -- [--mode top|catchup] [--top N] [--threshold N] [--dry-run] [--json]",
    "",
    "  --mode top       (default) audit the top 100 repos by rank",
    "  --mode catchup   audit every repo (~5000) - one-shot reconciliation",
    "  --top N          override default top-N for --mode top (default 100)",
    "  --threshold N    score below which a repo is 'incomplete' (default 70)",
    "  --dry-run        compute but do not write the queue file or Redis",
    "  --json           emit JSON summary to stdout",
  ].join("\n");
}

function parseArgs(argv: string[]): Options {
  let mode: Mode = "top";
  let topN = 100;
  let threshold = DEFAULT_THRESHOLD;
  let dryRun = false;
  let json = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--mode") {
      const next = argv[++i];
      if (next !== "top" && next !== "catchup") {
        failUsage(`--mode must be 'top' or 'catchup', got ${next}`);
      }
      mode = next;
    } else if (arg.startsWith("--mode=")) {
      const value = arg.slice("--mode=".length);
      if (value !== "top" && value !== "catchup") {
        failUsage(`--mode must be 'top' or 'catchup', got ${value}`);
      }
      mode = value;
    } else if (arg === "--top") {
      topN = parsePositiveInt(argv[++i], "--top");
    } else if (arg.startsWith("--top=")) {
      topN = parsePositiveInt(arg.slice("--top=".length), "--top");
    } else if (arg === "--threshold") {
      threshold = parsePositiveInt(argv[++i], "--threshold");
    } else if (arg.startsWith("--threshold=")) {
      threshold = parsePositiveInt(arg.slice("--threshold=".length), "--threshold");
    } else {
      failUsage(`unknown argument: ${arg}`);
    }
  }
  return { mode, topN, threshold, dryRun, json };
}

function parsePositiveInt(raw: string | undefined, name: string): number {
  if (!raw) failUsage(`${name} requires a value`);
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
    failUsage(`${name} must be a positive integer, got ${raw}`);
  }
  return n;
}

function failUsage(message: string): never {
  console.error(`check-profile-completion: ${message}`);
  console.error(usage());
  process.exit(64);
}

// ---------------------------------------------------------------------------
// Score components
// ---------------------------------------------------------------------------

interface RepoProfileEntry {
  fullName?: string;
  status?: string;
  aisoScan?: { status?: string } | null;
}

interface ScoreBreakdown {
  required: number;
  coverage: number;
  deltas: number;
  enrichment: number;
}

interface RepoVerdict {
  fullName: string;
  rank: number | null;
  completenessScore: number;
  breakdown: ScoreBreakdown;
  missingFields: string[];
  underScannedSources: string[];
  socialFiring: number;
  staleDeltas: boolean;
  hasEnrichmentSnapshot: boolean;
  recommendedAction: "enrich" | "sweep" | "both" | "noop";
  priority: number;
  lastSweptAt: string | null;
}

function scoreRequired(repo: Repo): { points: number; missing: string[] } {
  const missing: string[] = [];
  let points = 0;
  if (repo.description && repo.description.trim().length > 0) points += 5;
  else missing.push("description");
  if (repo.language && repo.language.trim().length > 0) points += 5;
  else missing.push("language");
  if (Array.isArray(repo.topics) && repo.topics.length > 0) points += 5;
  else missing.push("topics");
  if (typeof repo.stars === "number" && repo.stars > 0) points += 5;
  else missing.push("stars");
  if (typeof repo.momentumScore === "number" && repo.momentumScore > 0) points += 5;
  else missing.push("momentumScore");
  if (repo.lastCommitAt && Number.isFinite(Date.parse(repo.lastCommitAt))) points += 5;
  else missing.push("lastCommitAt");
  return { points, missing };
}

function scoreCoverage(repo: Repo): {
  points: number;
  socialFiring: number;
  underScanned: string[];
} {
  const ps = repo.mentions?.perSource;
  let firing = 0;
  const underScanned: string[] = [];
  for (const platform of SOCIAL_PLATFORMS) {
    const c7 = ps?.[platform]?.count7d ?? 0;
    if (c7 > 0) firing += 1;
    else underScanned.push(platform);
  }
  const points = Math.round((Math.min(firing, COVERAGE_CAP) / COVERAGE_CAP) * 30);
  return { points, socialFiring: firing, underScanned };
}

function scoreDeltas(repo: Repo): { points: number; staleDeltas: boolean } {
  let missingCount = 0;
  if (repo.starsDelta24hMissing) missingCount += 1;
  if (repo.starsDelta7dMissing) missingCount += 1;
  if (repo.starsDelta30dMissing) missingCount += 1;
  const points = Math.round(20 * (3 - missingCount) / 3);
  return { points, staleDeltas: missingCount > 0 };
}

function scoreEnrichment(
  repo: Repo,
  profile: RepoProfileEntry | null,
): { points: number; hasEnrichmentSnapshot: boolean } {
  let points = 0;
  let hasEnrichmentSnapshot = false;
  if (profile?.status === "scanned") {
    points += 5;
    hasEnrichmentSnapshot = true;
  }
  if (profile?.aisoScan?.status === "completed") points += 5;
  if (repo.lastReleaseAt || repo.lastReleaseTag) points += 5;
  if ((repo.mentions?.total7d ?? 0) >= 3) points += 5;
  return { points, hasEnrichmentSnapshot };
}

function decideAction(
  missingFields: string[],
  underScannedCount: number,
): RepoVerdict["recommendedAction"] {
  const triggersEnrich =
    missingFields.includes("description") ||
    missingFields.includes("language") ||
    missingFields.includes("topics");
  const triggersSweep = underScannedCount >= UNDER_SCANNED_TRIGGER;
  if (triggersEnrich && triggersSweep) return "both";
  if (triggersEnrich) return "enrich";
  if (triggersSweep) return "sweep";
  return "noop";
}

function computePriority(rank: number | null, score: number): number {
  const rankComponent = rank !== null ? Math.max(0, 1000 - rank) : 0;
  return rankComponent + (100 - score);
}

function judgeRepo(
  repo: Repo,
  profile: RepoProfileEntry | null,
  prevLastSweptAt: string | null,
): RepoVerdict {
  const required = scoreRequired(repo);
  const coverage = scoreCoverage(repo);
  const deltas = scoreDeltas(repo);
  const enrichment = scoreEnrichment(repo, profile);

  const completenessScore =
    required.points + coverage.points + deltas.points + enrichment.points;
  const recommendedAction = decideAction(required.missing, coverage.underScanned.length);
  const priority = computePriority(repo.rank ?? null, completenessScore);

  return {
    fullName: repo.fullName,
    rank: repo.rank ?? null,
    completenessScore,
    breakdown: {
      required: required.points,
      coverage: coverage.points,
      deltas: deltas.points,
      enrichment: enrichment.points,
    },
    missingFields: required.missing,
    underScannedSources: coverage.underScanned,
    socialFiring: coverage.socialFiring,
    staleDeltas: deltas.staleDeltas,
    hasEnrichmentSnapshot: enrichment.hasEnrichmentSnapshot,
    recommendedAction,
    priority,
    lastSweptAt: prevLastSweptAt,
  };
}

// ---------------------------------------------------------------------------
// IO helpers
// ---------------------------------------------------------------------------

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return fallback;
    throw err;
  }
}

async function readPreviousQueue(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const previous = await readJson<{ incomplete?: Array<{ fullName: string; lastSweptAt?: string | null }> }>(
    OUT_FILE,
    { incomplete: [] },
  );
  for (const entry of previous.incomplete ?? []) {
    if (entry.fullName && entry.lastSweptAt) out.set(entry.fullName, entry.lastSweptAt);
  }
  return out;
}

async function readProfilesIndex(): Promise<Map<string, RepoProfileEntry>> {
  const file = await readJson<{ profiles?: RepoProfileEntry[] }>(PROFILES_FILE, {
    profiles: [],
  });
  const map = new Map<string, RepoProfileEntry>();
  for (const profile of file.profiles ?? []) {
    if (profile?.fullName) map.set(profile.fullName.toLowerCase(), profile);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Summary builders
// ---------------------------------------------------------------------------

interface QueueSummary {
  byAction: Record<RepoVerdict["recommendedAction"], number>;
  p10Score: number;
  p50Score: number;
  channelsFiringHistogram: Record<string, number>;
}

function buildSummary(verdicts: RepoVerdict[]): QueueSummary {
  const byAction: QueueSummary["byAction"] = {
    enrich: 0,
    sweep: 0,
    both: 0,
    noop: 0,
  };
  const histogram: Record<string, number> = {};
  for (let i = 0; i <= COVERAGE_CAP; i += 1) histogram[String(i)] = 0;

  for (const v of verdicts) {
    byAction[v.recommendedAction] += 1;
    const bucket = String(Math.min(v.socialFiring, COVERAGE_CAP));
    histogram[bucket] = (histogram[bucket] ?? 0) + 1;
  }

  const sortedScores = verdicts.map((v) => v.completenessScore).sort((a, b) => a - b);
  const percentile = (p: number) => {
    if (sortedScores.length === 0) return 0;
    const idx = Math.min(sortedScores.length - 1, Math.floor((p / 100) * sortedScores.length));
    return sortedScores[idx];
  };
  return {
    byAction,
    p10Score: percentile(10),
    p50Score: percentile(50),
    channelsFiringHistogram: histogram,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();

  const [previousLastSweptAt, profilesByRepo, allRepos] = await Promise.all([
    readPreviousQueue(),
    readProfilesIndex(),
    Promise.resolve().then(() => getDerivedRepos()),
  ]);

  // Slice deterministically: top mode = first N by rank ascending; catchup = all.
  const sortedByRank = [...allRepos].sort(
    (a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER),
  );
  const subject = opts.mode === "top" ? sortedByRank.slice(0, opts.topN) : sortedByRank;

  const verdicts: RepoVerdict[] = subject.map((repo) =>
    judgeRepo(
      repo,
      profilesByRepo.get(repo.fullName.toLowerCase()) ?? null,
      previousLastSweptAt.get(repo.fullName) ?? null,
    ),
  );

  const incomplete = verdicts
    .filter((v) => v.completenessScore < opts.threshold)
    .sort((a, b) => b.priority - a.priority);

  const summary = buildSummary(incomplete);
  const generatedAt = new Date().toISOString();
  const durationMs = Date.now() - startedAt;

  const payload = {
    generatedAt,
    version: 1,
    mode: opts.mode,
    totalChecked: verdicts.length,
    thresholdScore: opts.threshold,
    incomplete,
    summary,
  };

  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(
      `profile-completion: mode=${opts.mode} totalChecked=${verdicts.length} incomplete=${incomplete.length} threshold=${opts.threshold} durationMs=${durationMs}`,
    );
    console.log(
      `  byAction: enrich=${summary.byAction.enrich} sweep=${summary.byAction.sweep} both=${summary.byAction.both} noop=${summary.byAction.noop}`,
    );
    console.log(
      `  scores: p10=${summary.p10Score} p50=${summary.p50Score} (lower = more incomplete)`,
    );
    if (incomplete.length > 0 && incomplete.length <= 10) {
      console.log("  worst offenders:");
      for (const v of incomplete.slice(0, 10)) {
        console.log(
          `    rank=${v.rank ?? "-"} ${v.fullName} score=${v.completenessScore} action=${v.recommendedAction} missing=[${v.missingFields.join(",")}]`,
        );
      }
    }
  }

  if (opts.dryRun) {
    console.log("dry-run: not writing queue file or Redis");
    return;
  }

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(payload, null, 2) + "\n", "utf8");
  const redisResult = await writeDataStore("profile-completion-queue", payload);
  await writeSourceMeta({
    source: "profile-completion-check",
    reason: "ok",
    count: incomplete.length,
    durationMs,
    extra: {
      mode: opts.mode,
      totalChecked: verdicts.length,
      threshold: opts.threshold,
      byAction: summary.byAction,
    },
  });

  console.log(
    `wrote ${OUT_FILE} (incomplete=${incomplete.length}) [redis: ${redisResult.source}]`,
  );
}

process.on("SIGINT", () => process.exit(130));

main()
  .catch((err) => {
    console.error("check-profile-completion failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDataStore();
  });
