// Runtime loader for the "Projected trajectory" surface on the repo
// profile page.
//
// Reads `predictions.jsonl` from the pipeline data directory and exposes
// a pure, per-fullName lookup that returns the most recent forecast for
// a repo. The feed schema is the one declared in src/lib/db/schema.ts
// (predictions table): one row per (repoFullName, horizonDays,
// modelVersion, generatedAt). If future rows diverge from the on-disk
// shape, the defensive guards here skip malformed lines rather than
// crash the page.
//
// Selection rule (matches the spec):
//   1. Filter rows whose `fullName` matches case-insensitively.
//   2. Within a (fullName, horizonDays, modelVersion) triple, keep only
//      the row with the highest `generatedAt` (latest generation).
//   3. Choose the horizon closest to 30 days; tie-break by preferring
//      30 exactly, then the smaller horizon (sooner = more trustable).
//   4. Return null when the file is missing, empty, or has no rows
//      for this repo.
//
// No pipeline side effects. Cached by mtime — same pattern as
// src/lib/repo-reasons.ts.

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { currentDataDir } from "./pipeline/storage/file-persistence";

export const PREDICTIONS_FILE = "predictions.jsonl";

const DEFAULT_HORIZON_DAYS = 30;

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

export interface PredictionItem {
  /** Projected stars at horizon. */
  pointEstimate: number;
  /** 10th percentile lower bound of the confidence band. */
  p10: number;
  /** 90th percentile upper bound of the confidence band. */
  p90: number;
  /** Forecast horizon in days (e.g. 7, 30, 90). */
  horizonDays: number;
  /** Model identifier (e.g. "v1-velocity-extrapolation"). */
  modelVersion: string;
  /** ISO timestamp when the prediction was generated. */
  generatedAt: string;
  /** Current stars at prediction time — lets the UI show % delta. */
  baseline: number;
}

// ---------------------------------------------------------------------------
// On-disk row shape — accepts both the schema-name and the in-process
// PredictionRecord shape to be tolerant of whichever writer lands first.
// ---------------------------------------------------------------------------

interface RawPredictionRow {
  // PredictionRecord shape (src/lib/predictions.ts)
  fullName?: unknown;
  horizonDays?: unknown;
  pointEstimate?: unknown;
  lowP10?: unknown;
  highP90?: unknown;
  modelVersion?: unknown;
  generatedAt?: unknown;
  inputs?: {
    stars?: unknown;
    capturedAt?: unknown;
  };
  // predictions table shape (src/lib/db/schema.ts)
  repo_full_name?: unknown;
  horizon_days?: unknown;
  point_estimate?: unknown;
  low_p10?: unknown;
  high_p90?: unknown;
  model_version?: unknown;
  generated_at?: unknown;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

interface NormalizedRow {
  fullName: string;
  horizonDays: number;
  pointEstimate: number;
  p10: number;
  p90: number;
  modelVersion: string;
  generatedAt: string;
  baseline: number;
}

function normalizeRow(row: RawPredictionRow): NormalizedRow | null {
  const fullName =
    asString(row.fullName) ?? asString(row.repo_full_name) ?? null;
  const horizonDays =
    asNumber(row.horizonDays) ?? asNumber(row.horizon_days) ?? null;
  const pointEstimate =
    asNumber(row.pointEstimate) ?? asNumber(row.point_estimate) ?? null;
  const p10 = asNumber(row.lowP10) ?? asNumber(row.low_p10) ?? null;
  const p90 = asNumber(row.highP90) ?? asNumber(row.high_p90) ?? null;
  const modelVersion =
    asString(row.modelVersion) ?? asString(row.model_version) ?? null;
  const generatedAt =
    asString(row.generatedAt) ?? asString(row.generated_at) ?? null;

  if (
    !fullName ||
    horizonDays === null ||
    pointEstimate === null ||
    p10 === null ||
    p90 === null ||
    !modelVersion ||
    !generatedAt
  ) {
    return null;
  }

  // Baseline preference: inputs.stars captured at prediction time (the
  // authoritative value); otherwise fall back to the point estimate so the
  // delta math never blows up (it'll render as +0%).
  const baseline = asNumber(row.inputs?.stars) ?? pointEstimate;

  return {
    fullName,
    horizonDays,
    pointEstimate,
    p10,
    p90,
    modelVersion,
    generatedAt,
    baseline,
  };
}

// ---------------------------------------------------------------------------
// File loader (mtime-cached) — mirrors repo-reasons.ts
// ---------------------------------------------------------------------------

let cache:
  | {
      mtimeMs: number;
      rows: NormalizedRow[];
    }
  | null = null;

function predictionsFilePath(): string {
  return join(currentDataDir(), PREDICTIONS_FILE);
}

function loadFileSync(): NormalizedRow[] {
  const path = predictionsFilePath();
  if (!existsSync(path)) return [];
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  const out: NormalizedRow[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as RawPredictionRow;
      const normalized = normalizeRow(parsed);
      if (normalized) out.push(normalized);
    } catch {
      // Skip malformed lines — the rest of the file is still usable.
    }
  }
  return out;
}

function ensureCache(): NormalizedRow[] {
  const path = predictionsFilePath();
  let mtimeMs = -1;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    mtimeMs = -1;
  }
  if (cache && cache.mtimeMs === mtimeMs) return cache.rows;
  const rows = loadFileSync();
  cache = { mtimeMs, rows };
  return rows;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the most appropriate prediction for a repo. Returns null when
 * no suitable forecast exists on disk.
 *
 * The resolver dedupes by (fullName, horizonDays, modelVersion) keeping
 * the row with the highest `generatedAt`, then selects the horizon
 * closest to 30 days. This surfaces a sensible "what will this repo
 * look like in a month" card without forcing the caller to know which
 * horizons have been precomputed.
 */
export function getPredictionForRepo(
  fullName: string,
): PredictionItem | null {
  if (!fullName) return null;
  const target = fullName.toLowerCase();

  const rows = ensureCache();
  if (rows.length === 0) return null;

  // Step 1 — filter to this repo (case-insensitive on fullName so a
  // sloppy writer can't hide behind casing).
  const candidates = rows.filter(
    (r) => r.fullName.toLowerCase() === target,
  );
  if (candidates.length === 0) return null;

  // Step 2 — dedupe by (horizonDays, modelVersion), keeping newest.
  const latest = new Map<string, NormalizedRow>();
  for (const row of candidates) {
    const key = `${row.horizonDays}::${row.modelVersion}`;
    const existing = latest.get(key);
    if (!existing) {
      latest.set(key, row);
      continue;
    }
    const rowTs = Date.parse(row.generatedAt);
    const existingTs = Date.parse(existing.generatedAt);
    // Invalid timestamps compare as NaN — fall back to string compare so
    // lexicographically-later ISO strings still win.
    const rowNewer = Number.isNaN(rowTs) || Number.isNaN(existingTs)
      ? row.generatedAt > existing.generatedAt
      : rowTs > existingTs;
    if (rowNewer) latest.set(key, row);
  }

  // Step 3 — pick the horizon closest to 30d; tie-break: prefer exact 30,
  // then the smaller horizon (sooner forecast is more trustworthy when
  // both are equidistant from the 30-day target).
  let best: NormalizedRow | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const row of latest.values()) {
    const dist = Math.abs(row.horizonDays - DEFAULT_HORIZON_DAYS);
    if (dist < bestDist) {
      best = row;
      bestDist = dist;
      continue;
    }
    if (dist === bestDist && best) {
      if (row.horizonDays === DEFAULT_HORIZON_DAYS) {
        best = row;
      } else if (
        best.horizonDays !== DEFAULT_HORIZON_DAYS &&
        row.horizonDays < best.horizonDays
      ) {
        best = row;
      }
    }
  }

  if (!best) return null;

  return {
    pointEstimate: best.pointEstimate,
    p10: best.p10,
    p90: best.p90,
    horizonDays: best.horizonDays,
    modelVersion: best.modelVersion,
    generatedAt: best.generatedAt,
    baseline: best.baseline,
  };
}

/** Test-only cache reset. */
export function __resetRepoPredictionsCacheForTests(): void {
  cache = null;
}
