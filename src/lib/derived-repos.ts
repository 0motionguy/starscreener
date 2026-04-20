// Build a fully-assembled Repo[] entirely from committed JSON
// (data/trending.json + data/deltas.json). Used by surfaces that run on cold
// Vercel Lambdas where the in-memory repoStore is empty.
//
// Cached once per process because both source files are static at runtime —
// they ship with the build, so second-and-later calls are a no-op.
//
// Scope: discovery + search surfaces (homepage, /api/search, /api/repos,
// compare + category OG cards). MCP tools + admin pipeline routes continue
// to read the in-memory stores.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Repo } from "./types";
import { slugToId } from "./utils";
import {
  assembleRepoFromTrending,
  getAllFullNames,
  getDeltas,
  getTrending,
  lastFetchedAt,
  type DeltaValue,
  type TrendingLanguage,
  type TrendingPeriod,
  type TrendingRow,
} from "./trending";
import { scoreBatch } from "./pipeline/scoring/engine";
import {
  classifyBatch,
  deriveTags,
} from "./pipeline/classification/classifier";

let _cache: Repo[] | null = null;
let _byFullName: Map<string, Repo> | null = null;
let _byId: Map<string, Repo> | null = null;
let _repoEnrichment: Map<string, Repo> | null = null;
let _snapshotSparklines: Map<string, number[]> | null = null;

const PERIODS: TrendingPeriod[] = [
  "past_24_hours",
  "past_week",
  "past_month",
];
const LANGS: TrendingLanguage[] = ["All", "Python", "TypeScript", "Rust", "Go"];
const DAY_MS = 86_400_000;
const SPARKLINE_DAYS = 30;
const MIN_RENDERABLE_HISTORY_DAYS = 7;

interface TrendingRepoAggregate {
  row: TrendingRow;
  stars24h: number;
  stars7d: number;
  stars30d: number;
  trendScore24h: number;
  trendScore7d: number;
  trendScore30d: number;
  activityStars: number;
  forks: number;
  contributors: number;
  has24h: boolean;
  has7d: boolean;
  has30d: boolean;
  collectionNames: Set<string>;
}

interface SnapshotRow {
  repoId: string;
  capturedAtMs: number;
  stars: number;
}

function parseMetric(value: string | null | undefined): number {
  const parsed = Number.parseInt(value ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseScore(value: string | null | undefined): number {
  const parsed = Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function contributorCount(row: TrendingRow): number {
  return row.contributor_logins
    ? row.contributor_logins.split(",").filter(Boolean).length
    : 0;
}

function parseCollectionNames(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

function safeReadLines(filePath: string): string[] {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function loadRepoEnrichment(): Map<string, Repo> {
  if (_repoEnrichment) return _repoEnrichment;

  const enrichments = new Map<string, Repo>();
  const filePath = join(process.cwd(), ".data", "repos.jsonl");

  for (const line of safeReadLines(filePath)) {
    try {
      const repo = JSON.parse(line) as Repo;
      if (!repo.fullName) continue;
      enrichments.set(repo.fullName.toLowerCase(), repo);
    } catch {
      // Ignore malformed lines in best-effort local enrichment.
    }
  }

  _repoEnrichment = enrichments;
  return enrichments;
}

function buildSparklineFromSnapshots(
  rows: SnapshotRow[],
  days: number = SPARKLINE_DAYS,
): number[] {
  const sorted = [...rows].sort((a, b) => a.capturedAtMs - b.capturedAtMs);
  const out = new Array<number>(days).fill(0);
  const today = new Date();
  today.setUTCHours(23, 59, 59, 999);

  let cursor = 0;
  let lastKnown = 0;

  for (let i = 0; i < days; i += 1) {
    const daysAgo = days - 1 - i;
    const dayEndMs = today.getTime() - daysAgo * DAY_MS;
    while (
      cursor < sorted.length &&
      sorted[cursor] &&
      sorted[cursor].capturedAtMs <= dayEndMs
    ) {
      lastKnown = sorted[cursor].stars;
      cursor += 1;
    }
    out[i] = lastKnown;
  }

  return out;
}

function loadSnapshotSparklines(): Map<string, number[]> {
  if (_snapshotSparklines) return _snapshotSparklines;

  const byRepo = new Map<string, SnapshotRow[]>();
  const filePath = join(process.cwd(), ".data", "snapshots.jsonl");

  for (const line of safeReadLines(filePath)) {
    try {
      const parsed = JSON.parse(line) as {
        repoId?: string;
        capturedAt?: string;
        stars?: number;
      };
      const repoId = parsed.repoId?.trim();
      const capturedAtMs = parsed.capturedAt ? Date.parse(parsed.capturedAt) : NaN;
      const stars = Number(parsed.stars ?? 0);
      if (!repoId || !Number.isFinite(capturedAtMs) || !Number.isFinite(stars)) {
        continue;
      }
      const current = byRepo.get(repoId) ?? [];
      current.push({ repoId, capturedAtMs, stars });
      byRepo.set(repoId, current);
    } catch {
      // Ignore malformed lines in best-effort local enrichment.
    }
  }

  const sparklines = new Map<string, number[]>();
  for (const [repoId, rows] of byRepo.entries()) {
    sparklines.set(repoId, buildSparklineFromSnapshots(rows));
  }

  _snapshotSparklines = sparklines;
  return sparklines;
}

function hasRenderableSparkline(sparkline: number[]): boolean {
  if (sparkline.length < MIN_RENDERABLE_HISTORY_DAYS) return false;
  const nonZeroDays = sparkline.filter(
    (value) => Number.isFinite(value) && value > 0,
  ).length;
  const uniqueValues = new Set(sparkline).size;
  return nonZeroDays >= MIN_RENDERABLE_HISTORY_DAYS && uniqueValues > 1;
}

function normalizeSparklineToStars(
  sparkline: number[],
  starsNow: number,
): number[] {
  if (sparkline.length === 0 || starsNow <= 0) return sparkline;
  const lastValue = sparkline[sparkline.length - 1] ?? 0;
  if (lastValue <= 0 || lastValue === starsNow) return sparkline;

  const scale = starsNow / lastValue;
  const normalized = sparkline.map((value) =>
    Math.max(0, Math.round(value * scale)),
  );
  normalized[normalized.length - 1] = starsNow;

  for (let i = 1; i < normalized.length; i += 1) {
    if (normalized[i] < normalized[i - 1]) {
      normalized[i] = normalized[i - 1];
    }
  }

  return normalized;
}

function fillLinearSegment(
  out: number[],
  startIndex: number,
  endIndex: number,
  startValue: number,
  endValue: number,
): void {
  if (endIndex <= startIndex) {
    out[endIndex] = endValue;
    return;
  }

  for (let i = startIndex; i <= endIndex; i += 1) {
    const ratio = (i - startIndex) / (endIndex - startIndex);
    out[i] = Math.round(startValue + (endValue - startValue) * ratio);
  }
}

function buildSyntheticSparkline(
  starsNow: number,
  starsDelta24h: number,
  starsDelta7d: number,
  starsDelta30d: number,
): number[] {
  if (starsNow <= 0) return new Array<number>(SPARKLINE_DAYS).fill(0);

  const delta24 = Math.max(0, Math.round(starsDelta24h));
  const delta7 = Math.max(delta24, Math.round(starsDelta7d));
  const delta30 = Math.max(delta7, Math.round(starsDelta30d));

  const thirtyDaysAgo = Math.max(0, starsNow - delta30);
  const sevenDaysAgo = Math.max(thirtyDaysAgo, starsNow - delta7);
  const yesterday = Math.max(sevenDaysAgo, starsNow - delta24);

  const out = new Array<number>(SPARKLINE_DAYS).fill(starsNow);
  fillLinearSegment(out, 0, 22, thirtyDaysAgo, sevenDaysAgo);
  fillLinearSegment(out, 22, 28, sevenDaysAgo, yesterday);
  fillLinearSegment(out, 28, 29, yesterday, starsNow);
  out[SPARKLINE_DAYS - 1] = starsNow;

  for (let i = 1; i < out.length; i += 1) {
    if (out[i] < out[i - 1]) {
      out[i] = out[i - 1];
    }
  }

  return out;
}

function pickSparkline(
  repoId: string,
  enrichment: Repo | undefined,
  starsNow: number,
  starsDelta24h: number,
  starsDelta7d: number,
  starsDelta30d: number,
): number[] {
  const snapshotSparkline = loadSnapshotSparklines().get(repoId) ?? [];
  if (hasRenderableSparkline(snapshotSparkline)) {
    return normalizeSparklineToStars(snapshotSparkline, starsNow);
  }

  const enrichedSparkline = enrichment?.sparklineData ?? [];
  if (hasRenderableSparkline(enrichedSparkline)) {
    return normalizeSparklineToStars(enrichedSparkline, starsNow);
  }

  return buildSyntheticSparkline(
    starsNow,
    starsDelta24h,
    starsDelta7d,
    starsDelta30d,
  );
}

function setPeriodMetrics(
  aggregate: TrendingRepoAggregate,
  period: TrendingPeriod,
  stars: number,
  totalScore: number,
): void {
  if (period === "past_24_hours") {
    aggregate.stars24h = Math.max(aggregate.stars24h, stars);
    aggregate.trendScore24h = Math.max(aggregate.trendScore24h, totalScore);
    aggregate.has24h = true;
  } else if (period === "past_week") {
    aggregate.stars7d = Math.max(aggregate.stars7d, stars);
    aggregate.trendScore7d = Math.max(aggregate.trendScore7d, totalScore);
    aggregate.has7d = true;
  } else if (period === "past_month") {
    aggregate.stars30d = Math.max(aggregate.stars30d, stars);
    aggregate.trendScore30d = Math.max(aggregate.trendScore30d, totalScore);
    aggregate.has30d = true;
  }
}

function buildTrendingAggregates(): Map<string, TrendingRepoAggregate> {
  const aggregates = new Map<string, TrendingRepoAggregate>();

  for (const period of PERIODS) {
    for (const lang of LANGS) {
      for (const row of getTrending(period, lang)) {
        if (!row.repo_name || !row.repo_name.includes("/")) continue;

        const stars = parseMetric(row.stars);
        const totalScore = parseScore(row.total_score);
        const forks = parseMetric(row.forks);
        const contributors = contributorCount(row);
        const collectionNames = parseCollectionNames(row.collection_names);

        let aggregate = aggregates.get(row.repo_name);
        if (!aggregate) {
          aggregate = {
            row,
            stars24h: 0,
            stars7d: 0,
            stars30d: 0,
            trendScore24h: 0,
            trendScore7d: 0,
            trendScore30d: 0,
            activityStars: 0,
            forks: 0,
            contributors: 0,
            has24h: false,
            has7d: false,
            has30d: false,
            collectionNames: new Set(collectionNames),
          };
          aggregates.set(row.repo_name, aggregate);
        } else if (
          (!aggregate.row.description && row.description) ||
          (!aggregate.row.primary_language && row.primary_language)
        ) {
          aggregate.row = { ...aggregate.row, ...row };
        }

        setPeriodMetrics(aggregate, period, stars, totalScore);
        aggregate.activityStars = Math.max(aggregate.activityStars, stars);
        aggregate.forks = Math.max(aggregate.forks, forks);
        aggregate.contributors = Math.max(aggregate.contributors, contributors);
        for (const name of collectionNames) aggregate.collectionNames.add(name);
      }
    }
  }

  return aggregates;
}

/**
 * Build a best-effort base Repo from aggregated OSS Insight rows. The trending
 * feed doesn't carry topics / createdAt / lastReleaseAt / openIssues, so
 * those fall back to safe zero / empty values. `lastCommitAt` is set to
 * the trending fetch timestamp — appearing in OSS Insight's trending list
 * implies recent activity, so this is a reasonable floor that avoids
 * zeroing out every repo's commit-freshness score.
 */
function baseRepoFromTrending(
  aggregate: TrendingRepoAggregate,
  fetchedAt: string,
): Repo {
  const row = aggregate.row;
  const parts = row.repo_name.split("/");
  const owner = parts[0] ?? "";
  const name = parts[1] ?? row.repo_name;
  return {
    id: slugToId(row.repo_name),
    fullName: row.repo_name,
    name,
    owner,
    ownerAvatarUrl: owner ? `https://github.com/${owner}.png` : "",
    description: row.description ?? "",
    url: `https://github.com/${row.repo_name}`,
    language: row.primary_language || null,
    topics: [],
    categoryId: "other",
    stars: aggregate.activityStars,
    forks: aggregate.forks,
    contributors: aggregate.contributors,
    openIssues: 0,
    lastCommitAt: fetchedAt,
    lastReleaseAt: null,
    lastReleaseTag: null,
    createdAt: "",
    starsDelta24h: 0,
    starsDelta7d: 0,
    starsDelta30d: 0,
    trendScore24h: 0,
    trendScore7d: 0,
    trendScore30d: 0,
    forksDelta7d: 0,
    contributorsDelta30d: 0,
    momentumScore: 0,
    movementStatus: "stable",
    rank: 0,
    categoryRank: 0,
    sparklineData: [],
    socialBuzzScore: 0,
    mentionCount24h: 0,
    tags: [],
    collectionNames: Array.from(aggregate.collectionNames).sort(),
  };
}

/**
 * Fully-assembled Repo[] built from committed JSON. Runs classify → score →
 * rank in one pass so consumers get the same shape that the in-memory
 * pipeline would have produced after recomputeAll(). Cached after the first
 * call.
 */
export function getDerivedRepos(): Repo[] {
  if (_cache) return _cache;

  // One aggregate per unique owner/name, taking the max period metric across
  // duplicate All/language buckets. OSS Insight's `row.stars` inside a bucket
  // is the stars-gained-in-period (a real delta), not the cumulative total —
  // the cumulative total lives in data/deltas.json as `stars_now`.
  const aggregates = buildTrendingAggregates();

  const deltas = getDeltas();
  const fetchedAt = lastFetchedAt;

  // repoId → stars_now lookup, so we can set Repo.stars to the cumulative
  // total (deltas.json) rather than the period-delta found in trending.json.
  const starsNowByRepoId = new Map<string, number>();
  for (const [repoId, entry] of Object.entries(deltas.repos)) {
    starsNowByRepoId.set(repoId, entry.stars_now);
  }

  // 1. Base Repo[]. Deltas come from two sources:
  //    a) OSS Insight period delta from `aggregate.stars{24h,7d,30d}` —
  //       real single-bucket numbers from the upstream trending feed.
  //       This is the PRIMARY source because OSS Insight's pre-computed
  //       period aggregates are the canonical upstream trend signal.
  //    b) data/deltas.json — git-history-derived. Used as a secondary
  //       fallback when (a) is missing for a given window AND (b) has
  //       a real (non-cold-start) value. This mostly fires for repos
  //       we track but that dropped out of OSS Insight's trending
  //       bucket for one window.
  //    We read `deltas.repos[repoId]` directly instead of the projected
  //    `starsDelta*Missing` flags because those fold the 1h-as-24h
  //    fallback into their semantics — which conflates with our source
  //    selection here.
  const isRealDelta = (d: DeltaValue | undefined): boolean =>
    !!d && d.value !== null && d.basis !== "cold-start";

  const repoEnrichment = loadRepoEnrichment();
  let repos: Repo[] = [];
  for (const aggregate of aggregates.values()) {
    const base = baseRepoFromTrending(aggregate, fetchedAt);
    const id = slugToId(aggregate.row.repo_name);

    const repoIdLookup = aggregate.row.repo_id;
    const starsNow =
      (repoIdLookup && starsNowByRepoId.get(repoIdLookup)) || 0;
    const deltaEntry = repoIdLookup ? deltas.repos[repoIdLookup] : undefined;

    const mergeDelta = (
      primary: number,
      hasPrimary: boolean,
      fallback: DeltaValue | undefined,
    ): { value: number; missing: boolean } => {
      if (hasPrimary) return { value: primary, missing: false };
      if (isRealDelta(fallback)) {
        return { value: fallback!.value as number, missing: false };
      }
      return { value: 0, missing: true };
    };

    const d24 = mergeDelta(
      aggregate.stars24h,
      aggregate.has24h,
      deltaEntry?.delta_24h,
    );
    const d7 = mergeDelta(
      aggregate.stars7d,
      aggregate.has7d,
      deltaEntry?.delta_7d,
    );
    const d30 = mergeDelta(
      aggregate.stars30d,
      aggregate.has30d,
      deltaEntry?.delta_30d,
    );
    const starsTotal = starsNow > 0 ? starsNow : aggregate.activityStars;
    const enrichment = repoEnrichment.get(base.fullName.toLowerCase());
    const enrichedBase: Repo = {
      ...base,
      ...(enrichment ?? {}),
      id,
      fullName: base.fullName,
      name: base.name,
      owner: base.owner,
      url: base.url,
      stars: starsTotal,
      forks: enrichment?.forks ?? aggregate.forks,
      contributors: enrichment?.contributors ?? aggregate.contributors,
      openIssues: enrichment?.openIssues ?? 0,
      lastCommitAt: enrichment?.lastCommitAt ?? fetchedAt,
      lastReleaseAt: enrichment?.lastReleaseAt ?? null,
      lastReleaseTag: enrichment?.lastReleaseTag ?? null,
      createdAt: enrichment?.createdAt ?? "",
      sparklineData: pickSparkline(
        id,
        enrichment,
        starsTotal,
        d24.value,
        d7.value,
        d30.value,
      ),
      collectionNames: Array.from(aggregate.collectionNames).sort(),
    };
    const withHistory = assembleRepoFromTrending(enrichedBase, deltas);

    repos.push({
      ...withHistory,
      id,
      stars: starsTotal,
      forks: enrichment?.forks ?? aggregate.forks,
      contributors: enrichment?.contributors ?? aggregate.contributors,
      starsDelta24h: d24.value,
      starsDelta7d: d7.value,
      starsDelta30d: d30.value,
      trendScore24h: aggregate.trendScore24h,
      trendScore7d: aggregate.trendScore7d,
      trendScore30d: aggregate.trendScore30d,
      hasMovementData: !(d24.missing && d7.missing && d30.missing),
      starsDelta24hMissing: d24.missing,
      starsDelta7dMissing: d7.missing,
      starsDelta30dMissing: d30.missing,
    });
  }

  // 2. Classify first so scoreBatch's per-category averages use the real
  //    topic-derived categoryIds instead of the "other" placeholder.
  const classifications = classifyBatch(repos);
  repos = repos.map((r, i) => ({
    ...r,
    categoryId: classifications[i].primary.categoryId,
    tags: deriveTags(r),
  }));

  // 3. Score in one pass so per-category averages are consistent.
  const scores = scoreBatch(repos);
  repos = repos.map((r, i) => ({
    ...r,
    momentumScore: scores[i].overall,
    movementStatus: scores[i].movementStatus,
  }));

  // 4. Rank by momentum desc, tracking per-category position.
  const sorted = [...repos].sort((a, b) => b.momentumScore - a.momentumScore);
  const perCatCounter = new Map<string, number>();
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const catIdx = (perCatCounter.get(r.categoryId) ?? 0) + 1;
    perCatCounter.set(r.categoryId, catIdx);
    sorted[i] = {
      ...r,
      rank: i + 1,
      categoryRank: catIdx,
    };
  }

  _cache = sorted;
  return sorted;
}

/** Case-insensitive lookup by `owner/name`. */
export function getDerivedRepoByFullName(fullName: string): Repo | null {
  if (!_byFullName) {
    _byFullName = new Map();
    for (const r of getDerivedRepos()) {
      _byFullName.set(r.fullName.toLowerCase(), r);
    }
  }
  return _byFullName.get(fullName.toLowerCase()) ?? null;
}

/** Lookup by slug id (e.g. `vercel--next-js`). */
export function getDerivedRepoById(id: string): Repo | null {
  if (!_byId) {
    _byId = new Map();
    for (const r of getDerivedRepos()) {
      _byId.set(r.id, r);
    }
  }
  return _byId.get(id) ?? null;
}

/** Track count for pagination debug. Equal to `getAllFullNames().length`. */
export function getDerivedRepoCount(): number {
  return getAllFullNames().length;
}

// Test-only cache reset.
export function __resetDerivedReposCache(): void {
  _cache = null;
  _byFullName = null;
  _byId = null;
  _repoEnrichment = null;
  _snapshotSparklines = null;
}
