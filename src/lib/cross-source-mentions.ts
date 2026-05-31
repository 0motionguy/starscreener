// Cross-source mentions detail loader — DATA-STORE backed (redis → bundled file).
//
// Reads the `repo-mentions-detail-rollup` payload (the output of the worker's
// `cross-source-sweep` fetcher / scripts/sweep-cross-source-mentions.ts) via
// the data-store: redis first, falling back to the bundled
// `data/repo-mentions-detail-rollup.json` on a cold start. Exposes a sync
// getter keyed by repo fullName + an async refresh hook that the home + repo
// pages call so fresh sweep output reaches profiles WITHOUT a redeploy.
//
// 2026-05-27: was readFileSync-only (frozen at build time), which is why fresh
// sweeps never surfaced. Migrated to createPayloadReader (mirrors
// src/lib/consensus-verdicts.ts). Call refreshCrossSourceMentionsFromStore()
// in the render path — see src/lib/refresh-mentions.ts.

import "server-only";

import { createPayloadReader } from "./data-store-reader";

import type {
  CrossSourceChannel,
  CrossSourceDetailRollup,
  CrossSourceMentionDetail,
} from "./types";

interface RawRollupMention {
  source?: string;
  url?: string;
  title?: string;
  text?: string;
  author?: string | null;
  engagement?: { score?: number; comments?: number; reactions?: number };
  observedAt?: string;
}

interface RawRollupRepo {
  fullName?: string;
  totalMentions7d?: number;
  perSource?: Partial<
    Record<
      CrossSourceChannel,
      { count7d?: number; countLifetime?: number; top?: RawRollupMention[] }
    >
  >;
}

interface RollupPayload {
  computedAt?: string;
  scanRunId?: string;
  windowDays?: number;
  repos?: Record<string, RawRollupRepo>;
}

const EMPTY: RollupPayload = { repos: {} };

const reader = createPayloadReader<RollupPayload>({
  key: "repo-mentions-detail-rollup",
  emptyPayload: EMPTY,
  normalize: (raw) =>
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as RollupPayload)
      : EMPTY,
});

/**
 * Hydrate the rollup from the data-store (redis → bundled file → memory).
 * Cheap to call per-render — 30s rate-limit + in-flight dedupe inside.
 */
export const refreshCrossSourceMentionsFromStore = reader.refresh;

// Per-repo index, rebuilt only when a fresh payload reference lands.
let _idxPayload: RollupPayload | null = null;
let _idx: Map<string, CrossSourceDetailRollup> | null = null;

function buildIndex(payload: RollupPayload): Map<string, CrossSourceDetailRollup> {
  const map = new Map<string, CrossSourceDetailRollup>();
  for (const [fullName, repo] of Object.entries(payload.repos ?? {})) {
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
            typeof m.observedAt === "string"
              ? m.observedAt
              : new Date(0).toISOString(),
        }));
      const count7d =
        typeof bucket.count7d === "number" ? bucket.count7d : top.length;
      perSource[channel] = {
        count7d,
        countLifetime:
          typeof bucket.countLifetime === "number" ? bucket.countLifetime : count7d,
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

function ensureIndex(): Map<string, CrossSourceDetailRollup> {
  const payload = reader.getPayload();
  if (_idx && _idxPayload === payload) return _idx;
  _idx = buildIndex(payload);
  _idxPayload = payload;
  return _idx;
}

/**
 * Sync getter for the per-repo cross-source detail rollup. Returns null when
 * the sweep hasn't produced data for the repo (or refresh hasn't run yet).
 */
export function getCrossSourceDetail(
  fullName: string,
): CrossSourceDetailRollup | null {
  if (typeof fullName !== "string" || !fullName.includes("/")) return null;
  return ensureIndex().get(fullName.toLowerCase()) ?? null;
}

/**
 * Data version for the derived-repos cache key. Keyed on the data-store
 * `writtenAt` so the derived cache invalidates the moment a fresh sweep lands
 * in redis (was file mtime+size in the readFileSync era).
 */
export function getCrossSourceMentionsDataVersion(): string {
  return reader.getEntry()?.writtenAt ?? "";
}

/** Test-only memo reset. */
export function __resetCrossSourceMentionsForTests(): void {
  reader.reset();
  _idxPayload = null;
  _idx = null;
}
