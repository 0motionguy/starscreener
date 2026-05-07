// Cross-source mentions detail loader.
//
// Reads data/repo-mentions-detail-rollup.json — the output of
// scripts/sweep-cross-source-mentions.ts — and exposes a sync getter
// keyed by repo fullName. The sweep writes top 5 mentions per source per
// repo over a 7d window; this loader is the read-side counterpart that
// feeds `mentions.detail` on the derived-repos pipeline.
//
// File-mtime caching mirrors other per-source loaders so derived-repos
// memoization invalidates correctly when a fresh sweep lands.

import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import type {
  CrossSourceChannel,
  CrossSourceDetailRollup,
  CrossSourceMentionDetail,
} from "./types";

const ROLLUP_FILE = resolve(process.cwd(), "data/repo-mentions-detail-rollup.json");

interface RawRollupRepo {
  fullName?: string;
  totalMentions7d?: number;
  perSource?: Partial<
    Record<
      CrossSourceChannel,
      {
        count7d?: number;
        top?: Array<{
          source?: string;
          url?: string;
          title?: string;
          text?: string;
          author?: string | null;
          engagement?: { score?: number; comments?: number; reactions?: number };
          observedAt?: string;
        }>;
      }
    >
  >;
}

interface RawRollupFile {
  computedAt?: string;
  scanRunId?: string;
  windowDays?: number;
  repos?: Record<string, RawRollupRepo>;
}

let _byFullName: Map<string, CrossSourceDetailRollup> | null = null;
let _dataVersion: string | null = null;

function fileSignature(): string | null {
  try {
    const stat = statSync(ROLLUP_FILE);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return null;
  }
}

function loadFresh(): Map<string, CrossSourceDetailRollup> {
  const map = new Map<string, CrossSourceDetailRollup>();
  let raw: RawRollupFile;
  try {
    raw = JSON.parse(readFileSync(ROLLUP_FILE, "utf8")) as RawRollupFile;
  } catch {
    return map; // file missing or unreadable — sweep hasn't run yet
  }
  for (const [fullName, repo] of Object.entries(raw.repos ?? {})) {
    if (!fullName.includes("/")) continue;
    const perSource: CrossSourceDetailRollup["perSource"] = {};
    for (const [src, bucket] of Object.entries(repo.perSource ?? {})) {
      if (!bucket) continue;
      const channel = src as CrossSourceChannel;
      const top: CrossSourceMentionDetail[] = (bucket.top ?? [])
        .filter((m) => typeof m.url === "string" && m.url.length > 0)
        .map((m) => ({
          source: channel,
          url: String(m.url ?? ""),
          title: typeof m.title === "string" ? m.title : "",
          text: typeof m.text === "string" ? m.text : "",
          author: typeof m.author === "string" ? m.author : null,
          engagement: m.engagement ?? {},
          observedAt:
            typeof m.observedAt === "string" ? m.observedAt : new Date(0).toISOString(),
        }));
      perSource[channel] = {
        count7d: typeof bucket.count7d === "number" ? bucket.count7d : top.length,
        top,
      };
    }
    map.set(fullName.toLowerCase(), {
      totalMentions7d:
        typeof repo.totalMentions7d === "number" ? repo.totalMentions7d : 0,
      perSource,
    });
  }
  return map;
}

function ensureLoaded(): Map<string, CrossSourceDetailRollup> {
  const sig = fileSignature();
  if (_byFullName && _dataVersion === sig) return _byFullName;
  _byFullName = loadFresh();
  _dataVersion = sig;
  return _byFullName;
}

/**
 * Sync getter for the per-repo cross-source detail rollup. Returns null
 * when the sweep hasn't produced data for the repo (or hasn't run at all).
 */
export function getCrossSourceDetail(
  fullName: string,
): CrossSourceDetailRollup | null {
  if (typeof fullName !== "string" || !fullName.includes("/")) return null;
  const map = ensureLoaded();
  return map.get(fullName.toLowerCase()) ?? null;
}

/**
 * Data version for the derived-repos cache key. Returns a stable string
 * keyed on the rollup file's mtime + size so the cache invalidates the
 * moment a fresh sweep commit lands.
 */
export function getCrossSourceMentionsDataVersion(): string {
  return fileSignature() ?? "";
}

/** Test-only memo reset. */
export function __resetCrossSourceMentionsForTests(): void {
  _byFullName = null;
  _dataVersion = null;
}
