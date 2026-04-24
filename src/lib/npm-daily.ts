// Daily npm download history loader.
//
// Reads .data/npm-daily.jsonl (written by scripts/scrape-npm-daily.mjs) and
// exposes a tight API for rendering a sparkline in the UI. Never hits the
// network — the scraper is responsible for keeping the JSONL fresh.
//
// The JSONL file is append-only, one row per (package, date):
//   {"package":"next","date":"2026-04-24","downloads":1234567,"fetchedAt":"..."}
//
// Loader behaviour:
//   - Mtime-cached read so repeated calls in a single render pass don't
//     re-parse the file.
//   - Returns up to the last 30 days sorted ascending (oldest -> newest).
//   - Zero-fills missing days inside the returned window so the sparkline
//     renders a continuous line even if the scraper skipped a day.
//   - Returns [] when the file is missing, unreadable, or the package has
//     no rows.

import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

export interface DailyDownload {
  date: string;
  downloads: number;
}

/** Canonical path — matches scripts/scrape-npm-daily.mjs output. */
const DEFAULT_PATH = resolve(process.cwd(), ".data", "npm-daily.jsonl");

/** Max days in the returned window. Keep in sync with scraper RANGE. */
const WINDOW_DAYS = 30;

interface RawRow {
  package: string;
  date: string;
  downloads: number;
}

interface CacheEntry {
  signature: string;
  byPackage: Map<string, DailyDownload[]>;
}

let cache: CacheEntry | null = null;

/** Override the JSONL path (tests only). Pass `null` to reset. */
let pathOverride: string | null = null;

/** @internal — for tests. */
export function __setDailyPathForTests(path: string | null): void {
  pathOverride = path;
  cache = null;
}

function currentPath(): string {
  return pathOverride ?? DEFAULT_PATH;
}

function fileSignature(path: string): string {
  try {
    const stat = statSync(path);
    return `${path}:${stat.mtimeMs}:${stat.size}`;
  } catch {
    return `${path}:missing`;
  }
}

function parseRow(line: string): RawRow | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const obj: unknown = JSON.parse(trimmed);
    if (!obj || typeof obj !== "object") return null;
    const rec = obj as Record<string, unknown>;
    const pkg = typeof rec.package === "string" ? rec.package : "";
    const date = typeof rec.date === "string" ? rec.date : "";
    const downloads = Number(rec.downloads);
    if (!pkg || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    if (!Number.isFinite(downloads)) return null;
    return { package: pkg, date, downloads: Math.max(0, downloads) };
  } catch {
    return null;
  }
}

function loadIndex(): Map<string, DailyDownload[]> {
  const path = currentPath();
  const signature = fileSignature(path);
  if (cache && cache.signature === signature) return cache.byPackage;

  const byPackage = new Map<string, DailyDownload[]>();

  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    cache = { signature, byPackage };
    return byPackage;
  }

  // Dedup by (package, date), last-write-wins — matches scraper semantics.
  const byKey = new Map<string, RawRow>();
  for (const line of text.split(/\r?\n/)) {
    const row = parseRow(line);
    if (!row) continue;
    byKey.set(`${row.package}::${row.date}`, row);
  }

  const grouped = new Map<string, RawRow[]>();
  for (const row of byKey.values()) {
    const list = grouped.get(row.package);
    if (list) list.push(row);
    else grouped.set(row.package, [row]);
  }

  for (const [pkg, rows] of grouped) {
    rows.sort((a, b) => a.date.localeCompare(b.date));
    const capped = rows.slice(-WINDOW_DAYS);
    byPackage.set(
      pkg,
      capped.map((row) => ({ date: row.date, downloads: row.downloads })),
    );
  }

  cache = { signature, byPackage };
  return byPackage;
}

/** Add N days (UTC) to an ISO date string. */
function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Integer day difference date2 - date1 (UTC). */
function daysBetween(date1: string, date2: string): number {
  const a = Date.UTC(
    Number(date1.slice(0, 4)),
    Number(date1.slice(5, 7)) - 1,
    Number(date1.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(date2.slice(0, 4)),
    Number(date2.slice(5, 7)) - 1,
    Number(date2.slice(8, 10)),
  );
  return Math.round((b - a) / 86_400_000);
}

/**
 * Return the last (up to) 30 daily snapshots for a package, sorted ascending.
 * Missing interior days are zero-filled so the caller can render a continuous
 * line without gaps. Returns [] if the package isn't tracked.
 */
export function getDailyDownloadsForPackage(name: string): DailyDownload[] {
  if (!name) return [];
  const raw = loadIndex().get(name);
  if (!raw || raw.length === 0) return [];

  const sorted = raw.slice().sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  // Defensive: if somehow shapes are off, just return what we have.
  if (!first || !last) return sorted;

  const span = daysBetween(first.date, last.date) + 1;
  if (span <= 0 || span > WINDOW_DAYS * 2) return sorted;

  const byDate = new Map(sorted.map((row) => [row.date, row.downloads]));
  const filled: DailyDownload[] = [];
  for (let i = 0; i < span; i += 1) {
    const date = addDays(first.date, i);
    filled.push({ date, downloads: byDate.get(date) ?? 0 });
  }

  return filled.slice(-WINDOW_DAYS);
}
