// Loader for OSS Insight collection YAMLs committed to data/collections/.
// Source files are Apache 2.0 — see data/collections/NOTICE.md for
// attribution and the resync procedure.

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { slugToId } from "./utils";
import type { Repo } from "./types";

const ROOT = resolve(process.cwd(), "data/collections");

export interface CollectionFile {
  /** Filename minus `.yml`. Also the URL slug. */
  slug: string;
  /** Upstream OSS Insight numeric ID. Informational, not used for routing. */
  id: number;
  /** Human-readable collection name. */
  name: string;
  /** `owner/repo` list in canonical GitHub case, verbatim from upstream. */
  items: string[];
}

/**
 * Hand-rolled parser — fixed three-field shape (`id:`, `name:`, `items:`),
 * no quotes / comments / multi-line in any of the 28 committed files.
 * Throws on missing `id` or `name` so build catches upstream schema drift
 * loudly instead of silently shipping a half-parsed collection.
 */
export function parseCollectionYaml(slug: string, raw: string): CollectionFile {
  let id: number | null = null;
  let name: string | null = null;
  const items: string[] = [];
  let inItems = false;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (inItems) {
      const m = line.match(/^\s*-\s+(\S.*?)\s*$/);
      if (m) {
        items.push(m[1]);
        continue;
      }
      inItems = false;
    }
    const idM = line.match(/^id:\s*(\d+)\s*$/);
    if (idM) {
      id = Number.parseInt(idM[1], 10);
      continue;
    }
    const nameM = line.match(/^name:\s*(.+?)\s*$/);
    if (nameM) {
      name = nameM[1];
      continue;
    }
    if (/^items:\s*$/.test(line)) {
      inItems = true;
    }
  }
  if (id === null || name === null) {
    throw new Error(`collection ${slug}: missing id or name field`);
  }
  return { slug, id, name, items };
}

let _cache: CollectionFile[] | null = null;

export function loadAllCollections(): CollectionFile[] {
  if (_cache) return _cache;
  const files = readdirSync(ROOT)
    .filter((f) => f.endsWith(".yml"))
    .sort();
  const out: CollectionFile[] = [];
  for (const file of files) {
    const slug = file.slice(0, -4);
    const raw = readFileSync(resolve(ROOT, file), "utf8");
    out.push(parseCollectionYaml(slug, raw));
  }
  _cache = out;
  return out;
}

export function loadCollection(slug: string): CollectionFile | null {
  return loadAllCollections().find((c) => c.slug === slug) ?? null;
}

/**
 * Build a stub Repo for a curated item that isn't currently in the
 * trending/repo store. Visible in the unified table as a muted row —
 * stars=0 + hasMovementData=false is the canonical curated-quiet
 * fingerprint that `isCuratedQuietStub` detects.
 */
export function buildCuratedStub(fullName: string): Repo {
  const [owner, name] = fullName.split("/");
  return {
    id: slugToId(fullName),
    fullName,
    name: name ?? fullName,
    owner: owner ?? "",
    ownerAvatarUrl: "",
    description: "",
    url: `https://github.com/${fullName}`,
    language: null,
    topics: [],
    categoryId: "",
    stars: 0,
    forks: 0,
    contributors: 0,
    openIssues: 0,
    lastCommitAt: "",
    lastReleaseAt: null,
    lastReleaseTag: null,
    createdAt: "",
    starsDelta24h: 0,
    starsDelta7d: 0,
    starsDelta30d: 0,
    forksDelta7d: 0,
    contributorsDelta30d: 0,
    hasMovementData: false,
    starsDelta24hMissing: true,
    starsDelta7dMissing: true,
    starsDelta30dMissing: true,
    forksDelta7dMissing: true,
    contributorsDelta30dMissing: true,
    momentumScore: 0,
    movementStatus: "stable",
    rank: 0,
    categoryRank: 0,
    sparklineData: [],
    socialBuzzScore: 0,
    mentionCount24h: 0,
  };
}

/**
 * True when `repo` is a curated-but-quiet stub produced by `buildCuratedStub`
 * (not in current trending data). Used by row renderers to mute cells.
 * stars=0 is the canonical signal: OSS Insight never lists a 0-star repo,
 * so this uniquely identifies stubs without adding a new Repo field.
 */
export function isCuratedQuietStub(repo: Repo): boolean {
  return repo.stars === 0 && repo.hasMovementData === false;
}

/**
 * Intersect the collection's `items` list with the provided Repo map
 * (indexed by lowercase fullName). Live-data repos appear first sorted by
 * momentumScore desc; curated-quiet stubs follow alphabetically.
 */
export function assembleCollectionRepos(
  collection: CollectionFile,
  liveByFullName: Map<string, Repo>,
): Repo[] {
  const rows: Repo[] = [];
  for (const item of collection.items) {
    const hit = liveByFullName.get(item.toLowerCase());
    rows.push(hit ?? buildCuratedStub(item));
  }
  rows.sort((a, b) => {
    const aQuiet = isCuratedQuietStub(a);
    const bQuiet = isCuratedQuietStub(b);
    if (aQuiet !== bQuiet) return aQuiet ? 1 : -1;
    if (aQuiet) return a.fullName.localeCompare(b.fullName);
    return b.momentumScore - a.momentumScore;
  });
  return rows;
}

/** Count of `collection.items` present in `liveByFullName`. */
export function liveCountFor(
  collection: CollectionFile,
  liveByFullName: Map<string, Repo>,
): number {
  let n = 0;
  for (const item of collection.items) {
    if (liveByFullName.has(item.toLowerCase())) n += 1;
  }
  return n;
}

/** Shared helper — build the case-insensitive fullName index once. */
export function indexReposByFullName(repos: Repo[]): Map<string, Repo> {
  const map = new Map<string, Repo>();
  for (const r of repos) map.set(r.fullName.toLowerCase(), r);
  return map;
}

// ---------------------------------------------------------------------------
// Display helpers used by /collections + /collections/[slug] pages + OG
// card. Written as minimal reductions over the curated item list + live
// repo index so the pages have one import path. If collection summaries
// get richer (category breakdown, freshness buckets), extend here.
// ---------------------------------------------------------------------------

export interface CollectionSummary {
  /** Total curated items (from the YAML). */
  total: number;
  /** Curated items resolved against the live repo index. */
  live: number;
  /** Items currently classified as a breakout. */
  breakoutCount: number;
  /** Items currently classified as hot (or rising). */
  hotCount: number;
}

export function summarizeCollection(
  collection: CollectionFile,
  liveIndex: Map<string, Repo>,
): CollectionSummary {
  let live = 0;
  let breakoutCount = 0;
  let hotCount = 0;
  for (const fullName of collection.items) {
    const repo = liveIndex.get(fullName.toLowerCase());
    if (!repo) continue;
    live += 1;
    if (repo.movementStatus === "breakout") breakoutCount += 1;
    else if (repo.movementStatus === "hot" || repo.movementStatus === "rising") {
      hotCount += 1;
    }
  }
  return {
    total: collection.items.length,
    live,
    breakoutCount,
    hotCount,
  };
}

/** Compact "Xh ago" / "Xd ago" for a timestamp. "never" when null. */
export function formatFreshness(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
