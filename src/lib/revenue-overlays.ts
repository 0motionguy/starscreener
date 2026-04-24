// Runtime loader for revenue overlays.
//
// Overlays come from two sources:
//  1. Verified (verified_trustmrr): data/revenue-overlays.json, written by
//     scripts/sync-trustmrr.mjs after each TrustMRR catalog sweep. Sparse —
//     only repos whose homepage matched a TrustMRR startup.
//  2. Self-reported (self_reported): approved rows in the revenue-submissions
//     JSONL (STARSCREENER_DATA_DIR/revenue-submissions.jsonl, written by the
//     /api/submissions/revenue intake and moderated at /admin/revenue-queue).
//     Loaded lazily per-request because the JSONL lives outside the committed
//     data dir and can change at runtime.
//
// Both sources are surfaced by this module; the UI decides which one to
// render and how.

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import type { RevenueOverlay } from "./types";
import {
  REVENUE_SUBMISSIONS_FILE,
  type RevenueSubmissionRecord,
  type SelfReportSubmission,
  type TrustMrrLinkSubmission,
} from "./revenue-submissions";
import { currentDataDir } from "./pipeline/storage/file-persistence";

export interface RevenueOverlaysFile {
  generatedAt: string | null;
  version: number;
  source: "trustmrr" | "mixed" | "none";
  catalogGeneratedAt: string | null;
  overlays: Record<string, RevenueOverlay>;
}

const FILE_PATH = resolve(process.cwd(), "data", "revenue-overlays.json");

const EMPTY_FILE: RevenueOverlaysFile = {
  generatedAt: null,
  version: 1,
  source: "none",
  catalogGeneratedAt: null,
  overlays: {},
};

// Overlay records older than this are suppressed entirely — the TrustMRR
// number is not worth showing as stale. 2–14d gets a staleness flag at render
// time.
const HARD_CUTOFF_MS = 14 * 24 * 60 * 60 * 1000;
const STALE_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000;

let cache:
  | {
      mtimeMs: number;
      file: RevenueOverlaysFile;
      byFullName: Map<string, RevenueOverlay>;
    }
  | null = null;

function loadFileSync(): RevenueOverlaysFile {
  if (!existsSync(FILE_PATH)) return EMPTY_FILE;
  try {
    const raw = readFileSync(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<RevenueOverlaysFile>;
    return {
      ...EMPTY_FILE,
      ...parsed,
      overlays:
        parsed.overlays && typeof parsed.overlays === "object"
          ? (parsed.overlays as Record<string, RevenueOverlay>)
          : {},
    };
  } catch {
    return EMPTY_FILE;
  }
}

function ensureCache() {
  let mtimeMs = -1;
  try {
    mtimeMs = existsSync(FILE_PATH) ? statSync(FILE_PATH).mtimeMs : -1;
  } catch {
    mtimeMs = -1;
  }

  if (cache && cache.mtimeMs === mtimeMs) return cache;

  const file = loadFileSync();
  const byFullName = new Map<string, RevenueOverlay>();
  for (const [fullName, overlay] of Object.entries(file.overlays)) {
    if (!overlay) continue;
    byFullName.set(fullName.toLowerCase(), overlay);
  }
  cache = { mtimeMs, file, byFullName };
  return cache;
}

export type OverlayFreshness = "fresh" | "stale" | "expired";

export function classifyFreshness(
  asOf: string | null | undefined,
  now: number = Date.now(),
): OverlayFreshness {
  if (!asOf) return "expired";
  const ts = Date.parse(asOf);
  if (!Number.isFinite(ts)) return "expired";
  const age = now - ts;
  if (age > HARD_CUTOFF_MS) return "expired";
  if (age > STALE_THRESHOLD_MS) return "stale";
  return "fresh";
}

/** Full RevenueOverlay (or null) for a repo. "expired" records return null. */
export function getRevenueOverlay(fullName: string): RevenueOverlay | null {
  const overlay = ensureCache().byFullName.get(fullName.toLowerCase()) ?? null;
  if (!overlay) return null;
  if (classifyFreshness(overlay.asOf) === "expired") return null;
  return overlay;
}

/** All overlays (for the /signals/revenue listing view). Skips expired. */
export function listRevenueOverlays(): RevenueOverlay[] {
  const { byFullName } = ensureCache();
  const out: RevenueOverlay[] = [];
  for (const overlay of byFullName.values()) {
    if (classifyFreshness(overlay.asOf) === "expired") continue;
    out.push(overlay);
  }
  return out;
}

export function getRevenueOverlaysMeta() {
  const { file } = ensureCache();
  return {
    generatedAt: file.generatedAt,
    source: file.source,
    catalogGeneratedAt: file.catalogGeneratedAt,
    matchedCount: Object.keys(file.overlays).length,
  };
}

// ---------------------------------------------------------------------------
// Self-reported overlays (Phase 2) — loaded from the approved rows of the
// revenue-submissions JSONL. Separate storage, separate cache, separate
// renderer (<SelfReportedRevenueCard>) so the verified/self-reported wall is
// preserved.
// ---------------------------------------------------------------------------

const SELF_REPORTED_CACHE_TTL_MS = 10_000;

let selfReportedCache:
  | { fetchedAtMs: number; byFullName: Map<string, RevenueOverlay> }
  | null = null;

function submissionsFilePath(): string {
  return resolve(currentDataDir(), REVENUE_SUBMISSIONS_FILE);
}

function loadApprovedSubmissions(): RevenueSubmissionRecord[] {
  const path = submissionsFilePath();
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, "utf8");
    const records: RevenueSubmissionRecord[] = [];
    for (const line of raw.split(/\r?\n/)) {
      if (!line) continue;
      try {
        const record = JSON.parse(line) as RevenueSubmissionRecord;
        if (record && record.status === "approved") records.push(record);
      } catch {
        // malformed line, skip
      }
    }
    return records;
  } catch {
    return [];
  }
}

function selfReportToOverlay(
  record: SelfReportSubmission,
): RevenueOverlay {
  return {
    tier: "self_reported",
    fullName: record.fullName,
    trustmrrSlug: null,
    mrrCents: record.mrrCents ?? null,
    last30DaysCents: null,
    totalCents: null,
    growthMrr30d: null,
    customers: typeof record.customers === "number" ? record.customers : null,
    activeSubscriptions: null,
    paymentProvider: record.paymentProvider,
    category: null,
    asOf: record.moderatedAt ?? record.submittedAt,
    matchConfidence: "manual",
    // proofUrl when present is the best "where did this come from" link;
    // fall back to the GitHub repo URL so the card always has a target.
    sourceUrl: record.proofUrl ?? record.repoUrl,
  };
}

function trustmrrLinkToOverlay(
  record: TrustMrrLinkSubmission,
): RevenueOverlay {
  // A trustmrr_link claim by itself does not grant verified numbers —
  // those come from the sync catalog match. But if the repo has no
  // verified overlay yet (e.g. catalog sync hasn't picked it up),
  // surfacing the claim as a pointer is better than nothing.
  return {
    tier: "verified_trustmrr",
    fullName: record.fullName,
    trustmrrSlug: record.trustmrrSlug,
    mrrCents: null,
    last30DaysCents: null,
    totalCents: null,
    growthMrr30d: null,
    customers: null,
    activeSubscriptions: null,
    paymentProvider: null,
    category: null,
    asOf: record.moderatedAt ?? record.submittedAt,
    matchConfidence: "manual",
    sourceUrl: `https://trustmrr.com/s/${record.trustmrrSlug}`,
  };
}

function ensureSelfReportedCache() {
  const now = Date.now();
  if (
    selfReportedCache &&
    now - selfReportedCache.fetchedAtMs < SELF_REPORTED_CACHE_TTL_MS
  ) {
    return selfReportedCache;
  }
  const approved = loadApprovedSubmissions();
  const byFullName = new Map<string, RevenueOverlay>();
  for (const record of approved) {
    // Only self_report rows surface as self-reported overlays; trustmrr_link
    // rows only act as a pointer when no verified overlay exists for the
    // fullName (handled at the caller).
    if (record.mode === "self_report") {
      byFullName.set(
        record.fullName.toLowerCase(),
        selfReportToOverlay(record),
      );
    }
  }
  selfReportedCache = { fetchedAtMs: now, byFullName };
  return selfReportedCache;
}

export function getSelfReportedOverlay(
  fullName: string,
): RevenueOverlay | null {
  const overlay =
    ensureSelfReportedCache().byFullName.get(fullName.toLowerCase()) ?? null;
  if (!overlay) return null;
  if (classifyFreshness(overlay.asOf) === "expired") return null;
  return overlay;
}

/**
 * TrustMRR-link claim for a repo — only returned when no verified overlay
 * already exists for the fullName. Used as a fallback pointer so a moderated
 * claim shows at least a "revenue verified on TrustMRR" badge before the
 * next catalog sweep picks up the match.
 */
export function getTrustmrrClaimOverlay(
  fullName: string,
): RevenueOverlay | null {
  if (getRevenueOverlay(fullName)) return null;
  const records = loadApprovedSubmissions().filter(
    (r) =>
      r.mode === "trustmrr_link" &&
      r.fullName.toLowerCase() === fullName.toLowerCase(),
  );
  if (records.length === 0) return null;
  const latest = records.sort(
    (a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt),
  )[0];
  return trustmrrLinkToOverlay(latest as TrustMrrLinkSubmission);
}
