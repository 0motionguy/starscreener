// Runtime loader for the "Why Trending" reason surface.
//
// Reads `reasons.jsonl` from the pipeline data directory (same file the
// in-memory `reasonStore` persists to) and exposes a pure, per-fullName
// lookup that returns up to 3 human-readable reasons sorted by severity.
//
// Loaded directly from disk (not from the in-memory singleton) because the
// repo detail page runs on cold Vercel Lambdas where the reasonStore is
// empty; the committed JSONL carries the pre-computed reason bundles so we
// can render without a full pipeline hydrate on every request.
//
// Cached by mtime — the file is rewritten in bulk after each pipeline
// recompute, so a single mtime stamp is enough to invalidate.

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { currentDataDir, FILES } from "./pipeline/storage/file-persistence";
import { REASON_METADATA } from "./pipeline/reasons/codes";
import type {
  ReasonCode,
  ReasonDetail,
  RepoReason,
} from "./pipeline/types";
import { slugToId } from "./utils";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Severity of a rendered reason.
 *
 * - `critical` — breakout / major-release / HN front-page class signals that
 *   should dominate the strip when present.
 * - `strong` — confirmed high-confidence momentum drivers (star spike, rank
 *   jump, viral mention).
 * - `info` — background context (organic growth, commit freshness).
 */
export type ReasonSeverity = "info" | "strong" | "critical";

export interface HumanReason {
  /** Original reason code from the pipeline detector. */
  code: ReasonCode;
  /** Visual/ranking tier. `critical` > `strong` > `info`. */
  severity: ReasonSeverity;
  /** 6-10 word plain-English headline surfaced in the strip. */
  headline: string;
  /** Optional one-sentence elaboration shown under the headline. */
  detail?: string;
  /** Attribution hint when the reason originates from an external platform. */
  sourceHint?: "HackerNews" | "Social" | "GitHub";
}

// ---------------------------------------------------------------------------
// Severity + source mapping
// ---------------------------------------------------------------------------

/**
 * Per-code baseline severity. Confidence can upgrade `strong` → `critical`
 * or downgrade to `info` at runtime; see `deriveSeverity()`.
 */
const BASE_SEVERITY: Record<ReasonCode, ReasonSeverity> = {
  breakout_detected: "critical",
  release_major: "critical",
  hacker_news_front_page: "critical",
  star_spike: "strong",
  star_velocity_up: "strong",
  rank_jump: "strong",
  release_recent: "strong",
  viral_social_post: "strong",
  category_top: "strong",
  social_buzz_elevated: "info",
  fork_velocity_up: "info",
  contributor_growth: "info",
  issue_activity_spike: "info",
  commit_fresh: "info",
  quiet_killer_detected: "info",
  organic_growth: "info",
};

/** Attribution for reason codes whose source is an identifiable platform. */
const SOURCE_HINTS: Partial<Record<ReasonCode, HumanReason["sourceHint"]>> = {
  hacker_news_front_page: "HackerNews",
  viral_social_post: "Social",
  social_buzz_elevated: "Social",
  release_recent: "GitHub",
  release_major: "GitHub",
  commit_fresh: "GitHub",
  fork_velocity_up: "GitHub",
  contributor_growth: "GitHub",
  issue_activity_spike: "GitHub",
};

const SEVERITY_RANK: Record<ReasonSeverity, number> = {
  critical: 3,
  strong: 2,
  info: 1,
};

/**
 * Combine the per-code baseline severity with the detector's confidence.
 *
 * - `low` confidence never rises above `info`.
 * - `high` confidence on a `strong` baseline upgrades to `critical` (mirrors
 *   the behavior of breakout/HN signals so a certified 5x star spike lands
 *   at the top of the stack).
 */
function deriveSeverity(
  code: ReasonCode,
  confidence: ReasonDetail["confidence"],
): ReasonSeverity {
  const base = BASE_SEVERITY[code] ?? "info";
  if (confidence === "low") return "info";
  if (confidence === "high" && base === "strong") return "critical";
  return base;
}

// ---------------------------------------------------------------------------
// File loader (mtime-cached)
// ---------------------------------------------------------------------------

let cache:
  | {
      mtimeMs: number;
      byRepoId: Map<string, RepoReason>;
    }
  | null = null;

function reasonsFilePath(): string {
  return join(currentDataDir(), FILES.reasons);
}

/** Parse the JSONL reasons file; returns an empty map if missing/corrupt. */
function loadFileSync(): Map<string, RepoReason> {
  const path = reasonsFilePath();
  if (!existsSync(path)) return new Map();

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return new Map();
  }

  const out = new Map<string, RepoReason>();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const record = JSON.parse(trimmed) as RepoReason;
      if (record && typeof record.repoId === "string") {
        out.set(record.repoId, record);
      }
    } catch {
      // Skip malformed lines — the rest of the file is still usable.
    }
  }
  return out;
}

function ensureCache(): Map<string, RepoReason> {
  const path = reasonsFilePath();
  let mtimeMs = -1;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    mtimeMs = -1;
  }
  if (cache && cache.mtimeMs === mtimeMs) return cache.byRepoId;
  const byRepoId = loadFileSync();
  cache = { mtimeMs, byRepoId };
  return byRepoId;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return up to 3 human-readable reasons for a repo, sorted by severity
 * (`critical` > `strong` > `info`) and then by detector priority.
 *
 * Resolution is case-insensitive `owner/name` → slug id (matches how
 * `derived-repos` and the pipeline's `repoStore` key their records). When
 * the reasons file is missing, empty, or has no entry for this repo, this
 * returns an empty array — callers (the `WhyTrending` component) render
 * `null` in that case.
 *
 * Pure modulo the mtime-cached file read. No pipeline side effects.
 */
export function getRepoReasons(fullName: string): HumanReason[] {
  if (!fullName) return [];
  const id = slugToId(fullName);
  const bundle = ensureCache().get(id);
  if (!bundle || !bundle.details || bundle.details.length === 0) return [];

  // Dedupe by code, preferring the first (detector generator emits deduped
  // bundles, but be defensive against historical files).
  const seen = new Set<ReasonCode>();
  const humans: HumanReason[] = [];
  for (const detail of bundle.details) {
    if (seen.has(detail.code)) continue;
    seen.add(detail.code);
    const severity = deriveSeverity(detail.code, detail.confidence);
    humans.push({
      code: detail.code,
      severity,
      headline: detail.headline,
      detail: detail.detail,
      sourceHint: SOURCE_HINTS[detail.code],
    });
  }

  humans.sort((a, b) => {
    const sev = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (sev !== 0) return sev;
    // Break ties using the static detector priority so the most prominent
    // signals (breakout, major release, HN) still rank above ties.
    const pa = REASON_METADATA[a.code]?.priority ?? 0;
    const pb = REASON_METADATA[b.code]?.priority ?? 0;
    return pb - pa;
  });

  return humans.slice(0, 3);
}

/** Test-only cache reset. */
export function __resetRepoReasonsCacheForTests(): void {
  cache = null;
}
