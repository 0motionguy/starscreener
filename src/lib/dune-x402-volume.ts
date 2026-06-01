// Dune historical x402 volume loader.
//
// Reads .data/dune-x402-volume.json (produced by scripts/fetch-dune-x402.mjs)
// and exposes typed getters for the /agent-commerce page.
//
// Phase 4 (data-API): Redis is the live source of truth, .data/ file is the
// fallback. Slug "dune-x402-volume" reserved for when the writer wires
// writeDataStore().

import "server-only";

import { readFileSync } from "fs";
import { resolve } from "path";

const SLUG = "dune-x402-volume";
const FILE_PATH = resolve(process.cwd(), ".data", `${SLUG}.json`);

export interface DuneX402VolumeFile {
  fetchedAt?: string;
  lastDay?: string | null;
  rows?: Array<{
    day: string;
    chain?: string;
    facilitator: string;
    txCount: number;
    volumeUsdc: string;
  }>;
}

let cached: DuneX402VolumeFile | null = null;

function readFromFile(): DuneX402VolumeFile | null {
  try {
    const raw = readFileSync(FILE_PATH, "utf8");
    return JSON.parse(raw) as DuneX402VolumeFile;
  } catch {
    return null;
  }
}

export function getDuneX402Volume(): DuneX402VolumeFile | null {
  if (cached) return cached;
  const file = readFromFile();
  if (file) cached = file;
  return cached;
}

interface RefreshResult {
  source: "redis" | "file" | "memory" | "missing";
  ageMs: number;
}

export type DuneX402VolumeSourceStatus =
  | "fresh"
  | "stale"
  | "missing"
  | "unknown";

export interface DuneX402VolumeStatusInfo {
  status: DuneX402VolumeSourceStatus;
  source: RefreshResult["source"] | "unknown";
  rowCount: number;
  label: string;
}

const DUNE_X402_VOLUME_STALE_AFTER_MS = 36 * 60 * 60 * 1000;

function parseLastDayEndMs(day: string | null | undefined): number | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const parsed = Date.parse(`${day}T23:59:59.999Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIsoMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function statusLabel(status: DuneX402VolumeSourceStatus): string {
  switch (status) {
    case "fresh":
      return "volume source fresh";
    case "stale":
      return "volume source stale";
    case "missing":
      return "volume source unavailable";
    case "unknown":
      return "volume source unknown";
  }
}

export function classifyDuneX402VolumeStatus(
  file: DuneX402VolumeFile | null,
  refresh?: RefreshResult,
  nowMs = Date.now(),
): DuneX402VolumeStatusInfo {
  const rowCount = Array.isArray(file?.rows) ? file.rows.length : 0;
  const source = refresh?.source ?? "unknown";

  if (!file) {
    return {
      status: "missing",
      source,
      rowCount,
      label: statusLabel("missing"),
    };
  }

  const fetchedAtMs = parseIsoMs(file.fetchedAt);
  const lastDayMs = parseLastDayEndMs(file.lastDay);
  const freshestPayloadMs = Math.max(fetchedAtMs ?? 0, lastDayMs ?? 0);

  let status: DuneX402VolumeSourceStatus;
  if (source === "missing") {
    status = rowCount > 0 ? "stale" : "missing";
  } else if (source === "file") {
    status = "stale";
  } else if (freshestPayloadMs <= 0) {
    status = rowCount > 0 ? "unknown" : "missing";
  } else if (nowMs - freshestPayloadMs > DUNE_X402_VOLUME_STALE_AFTER_MS) {
    status = "stale";
  } else {
    status = "fresh";
  }

  return {
    status,
    source,
    rowCount,
    label: statusLabel(status),
  };
}

let inflight: Promise<RefreshResult> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

export async function refreshDuneX402VolumeFromStore(): Promise<RefreshResult> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) {
    return { source: "memory", ageMs: sinceLast };
  }

  inflight = (async (): Promise<RefreshResult> => {
    try {
      const { getDataStore } = await import("./data-store");
      const store = getDataStore();
      const result = await store.read<DuneX402VolumeFile>(SLUG);
      if (result.data && result.source !== "missing") {
        cached = result.data;
        lastRefreshMs = Date.now();
        return { source: result.source, ageMs: result.ageMs };
      }
    } catch {
      // fall through to file fallback
    }
    const file = readFromFile();
    if (file) cached = file;
    lastRefreshMs = Date.now();
    return { source: file ? "file" : "missing", ageMs: 0 };
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

export function _resetDuneX402VolumeCacheForTests(): void {
  cached = null;
  lastRefreshMs = 0;
  inflight = null;
}
