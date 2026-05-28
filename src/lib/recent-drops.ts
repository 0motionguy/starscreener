// Recent drops — freshly-listed repos surfaced as "NEW" across the app.
//
// When a /drop submission transitions to "listed" in src/lib/repo-intake.ts we
// record it here so the ticker, featured cards, and trending table can flag it
// NEW for a short window. This is a distinct concept from src/lib/drop-events.ts
// (which logs submit-time created/duplicate events to a .data JSONL for an admin
// tile): we want the LIVE moment + avatar, in the Redis data-store the public
// surfaces already read.
//
// Read side mirrors src/lib/editorial-store.ts (createPayloadReader over a
// single slug). Write side is a read-modify-write append, newest-first, deduped
// by fullName and capped at MAX_RECENT — the collector keep-last discipline.

import { getDataStore } from "./data-store";
import { createPayloadReader } from "./data-store-reader";

export interface RecentDrop {
  fullName: string;
  owner: string;
  name: string;
  /** ISO timestamp when the drop went LIVE (status → listed). */
  listedAt: string;
  avatarUrl?: string;
}

export interface RecentDropsFile {
  updatedAt: string;
  /** Newest-first, capped at MAX_RECENT. */
  drops: RecentDrop[];
}

const STORE_KEY = "recent-drops";
const MAX_RECENT = 20;
/** A drop reads as "NEW" for 24h after it goes live. */
const DEFAULT_NEW_WINDOW_MS = 24 * 60 * 60 * 1000;

const EMPTY: RecentDropsFile = { updatedAt: "", drops: [] };

function normalizeDrop(input: unknown): RecentDrop | null {
  if (!input || typeof input !== "object") return null;
  const d = input as Partial<RecentDrop>;
  if (typeof d.fullName !== "string" || !d.fullName.includes("/")) return null;
  if (typeof d.listedAt !== "string" || !d.listedAt) return null;
  const [owner, name] = d.fullName.split("/", 2);
  return {
    fullName: d.fullName,
    owner: typeof d.owner === "string" && d.owner ? d.owner : owner,
    name: typeof d.name === "string" && d.name ? d.name : name,
    listedAt: d.listedAt,
    avatarUrl:
      typeof d.avatarUrl === "string" && d.avatarUrl ? d.avatarUrl : undefined,
  };
}

function normalizePayload(input: unknown): RecentDropsFile {
  if (!input || typeof input !== "object") return EMPTY;
  const p = input as Partial<RecentDropsFile>;
  const drops: RecentDrop[] = [];
  if (Array.isArray(p.drops)) {
    for (const raw of p.drops) {
      const drop = normalizeDrop(raw);
      if (drop) drops.push(drop);
    }
  }
  return {
    updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : "",
    drops: drops.slice(0, MAX_RECENT),
  };
}

/**
 * Pure: lowercased fullNames in `drops` listed within `windowMs` of `now`.
 * Extracted so it can be unit-tested without the data-store singleton.
 */
export function selectNewFullNames(
  drops: RecentDrop[],
  windowMs: number,
  now: number,
): Set<string> {
  const set = new Set<string>();
  for (const drop of drops) {
    const ts = Date.parse(drop.listedAt);
    if (Number.isFinite(ts) && now - ts < windowMs) {
      set.add(drop.fullName.toLowerCase());
    }
  }
  return set;
}

/**
 * Pure: prepend `next` to `prev`, dedupe by fullName (case-insensitive,
 * newest wins), cap at `max`. Extracted for unit testing.
 */
export function mergeRecentDrops(
  prev: RecentDrop[],
  next: RecentDrop,
  max: number = MAX_RECENT,
): RecentDrop[] {
  const deduped = prev.filter(
    (d) => d.fullName.toLowerCase() !== next.fullName.toLowerCase(),
  );
  return [next, ...deduped].slice(0, max);
}

const reader = createPayloadReader<RecentDropsFile>({
  key: STORE_KEY,
  emptyPayload: EMPTY,
  normalize: normalizePayload,
});

export const refreshRecentDropsFromStore = reader.refresh;

/** Newest-first recent drops from the in-memory cache. */
export function getRecentDrops(): RecentDrop[] {
  return reader.getPayload().drops;
}

/**
 * Lowercased fullNames that went live within `windowMs` (default 24h). Surfaces
 * test membership against this Set to decide whether to render a NEW badge.
 */
export function getNewFullNameSet(
  windowMs: number = DEFAULT_NEW_WINDOW_MS,
): Set<string> {
  return selectNewFullNames(reader.getPayload().drops, windowMs, Date.now());
}

export interface RecordRecentDropInput {
  fullName: string;
  listedAt: string;
  avatarUrl?: string;
}

/**
 * Append a freshly-listed drop to the `recent-drops` slug (read-modify-write,
 * newest-first, deduped by fullName, capped at MAX_RECENT). Best-effort:
 * callers wrap in try/catch so a store hiccup never fails repo intake.
 */
export async function recordRecentDrop(
  input: RecordRecentDropInput,
): Promise<void> {
  if (!input.fullName.includes("/")) return;
  const [owner, name] = input.fullName.split("/", 2);
  const drop: RecentDrop = {
    fullName: input.fullName,
    owner,
    name,
    listedAt: input.listedAt,
    avatarUrl: input.avatarUrl,
  };

  const store = getDataStore();
  const existing = await store.read<unknown>(STORE_KEY);
  const prev = normalizePayload(existing.data);
  const next: RecentDropsFile = {
    updatedAt: new Date().toISOString(),
    drops: mergeRecentDrops(prev.drops, drop, MAX_RECENT),
  };

  await store.write(STORE_KEY, next, {
    writer: "vercel:repo-intake",
    mirrorToFile: true,
  });
}

export const _resetRecentDropsCacheForTests = reader.reset;
