/**
 * Cross-source mentions reader for the MCP server.
 *
 * Loads `data/repo-mentions-detail-rollup.json` from the repo root each call
 * (no caching beyond what Node's filesystem layer gives us — the rollup is
 * regenerated every 6h by the cross-source sweep cron, and MCP responses are
 * cheap to recompute). The Next.js side has its own mtime-keyed loader at
 * src/lib/cross-source-mentions.ts; we deliberately don't share code because
 * the MCP package is standalone (no @/lib import path).
 *
 * Shape mirrors `CrossSourceDetailRollup` from src/lib/types.ts:
 *   { totalMentions7d, perSource: { [channel]: { count7d, top: Mention[] } } }
 *
 * Channels are the same 8 the sweep covers (twitter / reddit / hackernews /
 * bluesky / devto / lobsters / producthunt / tavily). Lookup by fullName is
 * case-insensitive.
 */
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

export const CROSS_SOURCE_CHANNELS = [
  "twitter",
  "reddit",
  "hackernews",
  "bluesky",
  "devto",
  "lobsters",
  "producthunt",
  "tavily",
] as const;

export type CrossSourceChannel = (typeof CROSS_SOURCE_CHANNELS)[number];

export interface CrossSourceMentionDetail {
  source: CrossSourceChannel;
  url: string;
  title: string;
  text: string;
  author: string | null;
  engagement: { score?: number; comments?: number; reactions?: number };
  observedAt: string;
}

export interface CrossSourceDetailPerSource {
  count7d: number;
  top: CrossSourceMentionDetail[];
}

export interface CrossSourceDetailRollup {
  totalMentions7d: number;
  perSource: Partial<Record<CrossSourceChannel, CrossSourceDetailPerSource>>;
}

export interface RepoMentionsResult {
  fullName: string;
  totalMentions7d: number;
  perSource: Partial<Record<CrossSourceChannel, CrossSourceDetailPerSource>>;
  flatRecent: CrossSourceMentionDetail[];
}

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
          engagement?: {
            score?: number;
            comments?: number;
            reactions?: number;
          };
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

const ROLLUP_PATH = resolvePath(
  process.cwd(),
  "data",
  "repo-mentions-detail-rollup.json",
);

const VALID_CHANNELS = new Set<string>(CROSS_SOURCE_CHANNELS);

function readRollupFile(): RawRollupFile {
  try {
    return JSON.parse(readFileSync(ROLLUP_PATH, "utf8")) as RawRollupFile;
  } catch {
    // File missing or unreadable — sweep hasn't run, or repo root differs.
    // Either way, an empty rollup is the right answer for the caller.
    return {};
  }
}

function normalizeMention(
  channel: CrossSourceChannel,
  raw: NonNullable<
    NonNullable<RawRollupRepo["perSource"]>[CrossSourceChannel]
  >["top"] extends Array<infer M> | undefined
    ? M
    : never,
): CrossSourceMentionDetail | null {
  const url = typeof raw?.url === "string" ? raw.url : "";
  if (!url) return null;
  return {
    source: channel,
    url,
    title: typeof raw?.title === "string" ? raw.title : "",
    text: typeof raw?.text === "string" ? raw.text : "",
    author: typeof raw?.author === "string" ? raw.author : null,
    engagement: raw?.engagement ?? {},
    observedAt:
      typeof raw?.observedAt === "string"
        ? raw.observedAt
        : new Date(0).toISOString(),
  };
}

function normalizeRepo(repo: RawRollupRepo): CrossSourceDetailRollup {
  const perSource: CrossSourceDetailRollup["perSource"] = {};
  for (const [src, bucket] of Object.entries(repo.perSource ?? {})) {
    if (!bucket) continue;
    if (!VALID_CHANNELS.has(src)) continue;
    const channel = src as CrossSourceChannel;
    const top: CrossSourceMentionDetail[] = (bucket.top ?? [])
      .map((m) => normalizeMention(channel, m))
      .filter((m): m is CrossSourceMentionDetail => m !== null);
    perSource[channel] = {
      count7d: typeof bucket.count7d === "number" ? bucket.count7d : top.length,
      top,
    };
  }
  return {
    totalMentions7d:
      typeof repo.totalMentions7d === "number" ? repo.totalMentions7d : 0,
    perSource,
  };
}

/**
 * Look up a repo's cross-source mentions by `owner/name` and return both the
 * per-source breakdown (verbatim) and a `flatRecent` slice sorted by
 * observedAt desc and capped at `limit`.
 *
 * Repos not in the rollup yield an empty result rather than throwing — the
 * MCP tool contract says "don't 404, return zeros".
 */
export function getRepoMentions(
  fullName: string,
  options: { channel?: CrossSourceChannel; limit?: number } = {},
): RepoMentionsResult {
  const limitRaw = options.limit ?? 10;
  const limit = Math.max(1, Math.min(50, Math.floor(limitRaw)));

  const empty: RepoMentionsResult = {
    fullName,
    totalMentions7d: 0,
    perSource: {},
    flatRecent: [],
  };

  if (typeof fullName !== "string" || !fullName.includes("/")) return empty;

  const file = readRollupFile();
  const repos = file.repos ?? {};
  const wanted = fullName.toLowerCase();

  let hit: RawRollupRepo | null = null;
  for (const [key, value] of Object.entries(repos)) {
    if (key.toLowerCase() === wanted) {
      hit = value;
      break;
    }
  }
  if (!hit) return empty;

  const normalized = normalizeRepo(hit);

  // Optional channel filter — narrows perSource to one bucket. Total stays
  // the all-channel total so callers can still see the bigger picture.
  const perSource: CrossSourceDetailRollup["perSource"] = options.channel
    ? normalized.perSource[options.channel]
      ? { [options.channel]: normalized.perSource[options.channel] }
      : {}
    : normalized.perSource;

  const flatRecent = Object.values(perSource)
    .flatMap((bucket) => (bucket ? bucket.top : []))
    .sort((a, b) => {
      // observedAt is ISO; lexicographic sort matches chronological for ISO
      // strings, but parse defensively in case the sweep ever emits a
      // non-strict timestamp.
      const tb = Date.parse(b.observedAt);
      const ta = Date.parse(a.observedAt);
      const tbSafe = Number.isFinite(tb) ? tb : 0;
      const taSafe = Number.isFinite(ta) ? ta : 0;
      return tbSafe - taSafe;
    })
    .slice(0, limit);

  return {
    fullName,
    totalMentions7d: normalized.totalMentions7d,
    perSource,
    flatRecent,
  };
}
