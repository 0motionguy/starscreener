// Runtime loader for the "Ideas targeting this repo" surface on the
// repo profile page.
//
// Reads `ideas.jsonl` (the intake store written by src/lib/ideas.ts)
// and filters rows whose `targetRepos` array contains this repo's
// fullName (case-insensitive). Optionally folds in per-idea reaction
// tallies from `reactions.jsonl` so the panel can render "build 4 ·
// use 12" chips without a client round-trip.
//
// Returns `[]` when the file is missing, empty, or no idea targets
// this repo. Capped at 5 by `createdAt` desc so the panel stays compact.
//
// mtime-cached per file (ideas + reactions) — same pattern as
// src/lib/repo-reasons.ts.

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { currentDataDir } from "./pipeline/storage/file-persistence";

export const IDEAS_FILE = "ideas.jsonl";
export const REACTIONS_FILE = "reactions.jsonl";

const MAX_ITEMS = 5;

// Only these statuses are safe to show on a public repo profile.
// pending_moderation and rejected stay private to the queue.
const PUBLICLY_VISIBLE_STATUSES = new Set([
  "published",
  "shipped",
  "archived",
]);

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

export interface IdeaItemReactions {
  build?: number;
  use?: number;
  buy?: number;
  invest?: number;
}

export interface IdeaItem {
  id: string;
  title: string;
  /** 1-line summary (maps to the idea's `pitch`). */
  summary: string;
  author?: string | null;
  createdAt: string;
  reactions?: IdeaItemReactions;
  /** Deep link to the canonical idea detail URL. */
  url: string;
}

// ---------------------------------------------------------------------------
// On-disk row shapes — only the fields we actually need are typed.
// ---------------------------------------------------------------------------

interface RawIdeaRow {
  id?: unknown;
  title?: unknown;
  pitch?: unknown;
  authorHandle?: unknown;
  status?: unknown;
  targetRepos?: unknown;
  createdAt?: unknown;
  publishedAt?: unknown;
}

interface RawReactionRow {
  objectType?: unknown;
  objectId?: unknown;
  reactionType?: unknown;
}

interface NormalizedIdea {
  id: string;
  title: string;
  pitch: string;
  authorHandle: string | null;
  status: string;
  targetRepos: string[];
  createdAt: string;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const entry of v) {
    if (typeof entry === "string" && entry.length > 0) out.push(entry);
  }
  return out;
}

function normalizeIdea(row: RawIdeaRow): NormalizedIdea | null {
  const id = asString(row.id);
  const title = asString(row.title);
  const pitch = asString(row.pitch);
  const status = asString(row.status);
  const createdAt =
    asString(row.createdAt) ?? asString(row.publishedAt) ?? null;
  if (!id || !title || !pitch || !status || !createdAt) return null;
  return {
    id,
    title,
    pitch,
    authorHandle: asString(row.authorHandle),
    status,
    targetRepos: asStringArray(row.targetRepos),
    createdAt,
  };
}

// ---------------------------------------------------------------------------
// File loaders (mtime-cached)
// ---------------------------------------------------------------------------

let ideasCache:
  | {
      mtimeMs: number;
      rows: NormalizedIdea[];
    }
  | null = null;

let reactionsCache:
  | {
      mtimeMs: number;
      byIdeaId: Map<string, IdeaItemReactions>;
    }
  | null = null;

function ideasFilePath(): string {
  return join(currentDataDir(), IDEAS_FILE);
}

function reactionsFilePath(): string {
  return join(currentDataDir(), REACTIONS_FILE);
}

function loadIdeasFileSync(): NormalizedIdea[] {
  const path = ideasFilePath();
  if (!existsSync(path)) return [];
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  const out: NormalizedIdea[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as RawIdeaRow;
      const normalized = normalizeIdea(parsed);
      if (normalized) out.push(normalized);
    } catch {
      // Skip malformed lines — the rest of the file is still usable.
    }
  }
  return out;
}

function loadReactionsFileSync(): Map<string, IdeaItemReactions> {
  const path = reactionsFilePath();
  const byIdeaId = new Map<string, IdeaItemReactions>();
  if (!existsSync(path)) return byIdeaId;
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return byIdeaId;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as RawReactionRow;
      if (parsed.objectType !== "idea") continue;
      const objectId = asString(parsed.objectId);
      const reactionType = asString(parsed.reactionType);
      if (!objectId || !reactionType) continue;
      if (
        reactionType !== "build" &&
        reactionType !== "use" &&
        reactionType !== "buy" &&
        reactionType !== "invest"
      ) {
        continue;
      }
      const bucket =
        byIdeaId.get(objectId) ??
        ({ build: 0, use: 0, buy: 0, invest: 0 } as Required<IdeaItemReactions>);
      bucket[reactionType] = (bucket[reactionType] ?? 0) + 1;
      byIdeaId.set(objectId, bucket);
    } catch {
      // Skip malformed lines.
    }
  }

  return byIdeaId;
}

function ensureIdeasCache(): NormalizedIdea[] {
  const path = ideasFilePath();
  let mtimeMs = -1;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    mtimeMs = -1;
  }
  if (ideasCache && ideasCache.mtimeMs === mtimeMs) return ideasCache.rows;
  const rows = loadIdeasFileSync();
  ideasCache = { mtimeMs, rows };
  return rows;
}

function ensureReactionsCache(): Map<string, IdeaItemReactions> {
  const path = reactionsFilePath();
  let mtimeMs = -1;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    mtimeMs = -1;
  }
  if (reactionsCache && reactionsCache.mtimeMs === mtimeMs) {
    return reactionsCache.byIdeaId;
  }
  const byIdeaId = loadReactionsFileSync();
  reactionsCache = { mtimeMs, byIdeaId };
  return byIdeaId;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve up to 5 most-recent ideas targeting the given repo. Returns
 * an empty array when the file is missing or no idea targets this repo.
 *
 * Targets are matched case-insensitively so a submitter who types
 * `Vercel/Next.js` still lands on the `vercel/next.js` page.
 *
 * When a reactions store exists we fold in per-idea build/use/buy/
 * invest counts; absent a store, the panel renders without chips.
 */
export function getIdeasForRepo(fullName: string): IdeaItem[] {
  if (!fullName) return [];
  const target = fullName.toLowerCase();

  const rows = ensureIdeasCache();
  if (rows.length === 0) return [];

  const matching = rows.filter((idea) => {
    if (!PUBLICLY_VISIBLE_STATUSES.has(idea.status)) return false;
    return idea.targetRepos.some(
      (repo) => repo.toLowerCase() === target,
    );
  });
  if (matching.length === 0) return [];

  // createdAt desc, then cap.
  matching.sort((a, b) => {
    const aTs = Date.parse(a.createdAt);
    const bTs = Date.parse(b.createdAt);
    if (Number.isNaN(aTs) || Number.isNaN(bTs)) {
      return a.createdAt < b.createdAt ? 1 : -1;
    }
    return bTs - aTs;
  });

  const top = matching.slice(0, MAX_ITEMS);

  const reactionsByIdeaId = ensureReactionsCache();

  return top.map((idea) => {
    const reactions = reactionsByIdeaId.get(idea.id) ?? null;
    const item: IdeaItem = {
      id: idea.id,
      title: idea.title,
      summary: idea.pitch,
      author: idea.authorHandle,
      createdAt: idea.createdAt,
      url: `/ideas/${idea.id}`,
    };
    if (reactions) {
      // Only include non-zero buckets so the UI doesn't render "build 0".
      const filtered: IdeaItemReactions = {};
      if ((reactions.build ?? 0) > 0) filtered.build = reactions.build;
      if ((reactions.use ?? 0) > 0) filtered.use = reactions.use;
      if ((reactions.buy ?? 0) > 0) filtered.buy = reactions.buy;
      if ((reactions.invest ?? 0) > 0) filtered.invest = reactions.invest;
      if (Object.keys(filtered).length > 0) item.reactions = filtered;
    }
    return item;
  });
}

/** Test-only cache reset. */
export function __resetRepoIdeasCacheForTests(): void {
  ideasCache = null;
  reactionsCache = null;
}
