import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  TwitterIngestionAuditLog,
  TwitterRepoSignal,
  TwitterScanRecord,
} from "./types";
import { createDebouncedPersist } from "@/lib/pipeline/storage/debounced-persist";
import {
  currentDataDir,
  ensureDataDir,
  isPersistenceEnabled,
  readJsonlFile,
  writeJsonlFile,
} from "@/lib/pipeline/storage/file-persistence";

const TWITTER_FILES = {
  repoSignals: "twitter-repo-signals.jsonl",
  scans: "twitter-scans.jsonl",
  auditLogs: "twitter-ingestion-audit.jsonl",
} as const;

// Keep every scan inside the retention window. Repo-level signals are now
// aggregated from all retained scans, so a low count cap would silently drop
// mentions gathered by additional collector runs.
const MAX_SCANS_PER_REPO = Number.MAX_SAFE_INTEGER;
const MAX_SCAN_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_AUDIT_LOGS = 1_000;
const MAX_AUDIT_LOG_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const PERSIST_DEBOUNCE_MS = 2_000;
const BUNDLED_TWITTER_DATA_DIR = path.join(process.cwd(), ".data");

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

async function readBundledTwitterJsonlFile<T>(filename: string): Promise<T[]> {
  if (path.resolve(currentDataDir()) === path.resolve(BUNDLED_TWITTER_DATA_DIR)) {
    return [];
  }

  const filePath = path.join(BUNDLED_TWITTER_DATA_DIR, filename);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err) {
    if (isEnoent(err)) return [];
    throw err;
  }

  const out: T[] = [];
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[twitter:storage] skipping malformed bundled JSONL line ${i + 1} in ${filename}: ${message}`,
      );
    }
  }
  return out;
}

async function readTwitterJsonlFile<T>(filename: string): Promise<T[]> {
  const records = await readJsonlFile<T>(filename);
  if (records.length > 0) return records;

  const bundledRecords = await readBundledTwitterJsonlFile<T>(filename);
  if (bundledRecords.length > 0) {
    console.info(
      `[twitter:storage] hydrated ${bundledRecords.length} ${filename} records from bundled snapshot`,
    );
  }
  return bundledRecords;
}

class InMemoryTwitterStore {
  private repoSignals = new Map<string, TwitterRepoSignal>();
  private repoSignalsByFullName = new Map<string, string>();
  private scans = new Map<string, TwitterScanRecord>();
  // Per-repo scan-id index. Maintained alongside `scans` so list/prune
  // operations don't have to walk the entire scans map. Audit LIB-04:
  // pruneScansForRepo was O(N log N) per upsert because listScansForRepo
  // sorted the full corpus before filtering by repoId. With this index,
  // pruning walks only the affected repo's bucket.
  private scansByRepo = new Map<string, Set<string>>();
  private auditLogs = new Map<string, TwitterIngestionAuditLog>();
  private dirty = false;

  upsertRepoSignal(signal: TwitterRepoSignal): void {
    this.repoSignals.set(signal.repoId, signal);
    this.repoSignalsByFullName.set(signal.githubFullName, signal.repoId);
    this.dirty = true;
    scheduleTwitterPersist();
  }

  getRepoSignal(repoId: string): TwitterRepoSignal | undefined {
    return this.repoSignals.get(repoId);
  }

  getRepoSignalByFullName(fullName: string): TwitterRepoSignal | undefined {
    const repoId = this.repoSignalsByFullName.get(fullName);
    return repoId ? this.repoSignals.get(repoId) : undefined;
  }

  listRepoSignals(): TwitterRepoSignal[] {
    return Array.from(this.repoSignals.values()).sort((a, b) =>
      a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
    );
  }

  upsertScan(scan: TwitterScanRecord): void {
    // Defensive: if a scanId is being reassigned to a different repo
    // (shouldn't happen — scanId is server-assigned and stable — but
    // a buggy ingest could drift), drop the old bucket entry first so
    // the index doesn't accumulate stale references.
    const existing = this.scans.get(scan.scanId);
    if (existing && existing.repo.repoId !== scan.repo.repoId) {
      this.scansByRepo.get(existing.repo.repoId)?.delete(scan.scanId);
    }
    this.scans.set(scan.scanId, scan);
    let bucket = this.scansByRepo.get(scan.repo.repoId);
    if (!bucket) {
      bucket = new Set();
      this.scansByRepo.set(scan.repo.repoId, bucket);
    }
    bucket.add(scan.scanId);
    this.pruneScansForRepo(scan.repo.repoId);
    this.dirty = true;
    scheduleTwitterPersist();
  }

  getScan(scanId: string): TwitterScanRecord | undefined {
    return this.scans.get(scanId);
  }

  listScans(): TwitterScanRecord[] {
    return Array.from(this.scans.values()).sort((a, b) =>
      a.completedAt < b.completedAt ? 1 : a.completedAt > b.completedAt ? -1 : 0,
    );
  }

  getLatestScanForRepo(repoId: string): TwitterScanRecord | undefined {
    return this.listScansForRepo(repoId, 1)[0];
  }

  listScansForRepo(repoId: string, limit = MAX_SCANS_PER_REPO): TwitterScanRecord[] {
    // Walk only the per-repo bucket — typical bucket size is tiny (single
    // double digits), so the local sort is cheap and we avoid the O(N log N)
    // full-corpus sort that the old `listScans().filter(...)` form did.
    const bucket = this.scansByRepo.get(repoId);
    if (!bucket || bucket.size === 0) return [];
    const out: TwitterScanRecord[] = [];
    for (const scanId of bucket) {
      const scan = this.scans.get(scanId);
      if (scan) out.push(scan);
    }
    out.sort((a, b) =>
      a.completedAt < b.completedAt ? 1 : a.completedAt > b.completedAt ? -1 : 0,
    );
    return out.slice(0, Math.max(0, limit));
  }

  upsertAuditLog(entry: TwitterIngestionAuditLog): void {
    this.auditLogs.set(entry.ingestionId, entry);
    this.pruneAuditLogs();
    this.dirty = true;
    scheduleTwitterPersist();
  }

  getAuditLog(ingestionId: string): TwitterIngestionAuditLog | undefined {
    return this.auditLogs.get(ingestionId);
  }

  listAuditLogs(): TwitterIngestionAuditLog[] {
    return Array.from(this.auditLogs.values()).sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    );
  }

  scanCount(): number {
    return this.scans.size;
  }

  private pruneScansForRepo(repoId: string): void {
    // Walks the per-repo bucket only (typically a small Set). Deletes
    // age-expired scans from both the main map and the bucket index so
    // the two stay in lockstep.
    //
    // Note: MAX_SCANS_PER_REPO = MAX_SAFE_INTEGER intentionally — the
    // age check is the real cap. The "exceedsCap" branch from the prior
    // implementation was unreachable; keeping it would have required an
    // ordered structure here. Drop it.
    const bucket = this.scansByRepo.get(repoId);
    if (!bucket || bucket.size === 0) return;
    const now = Date.now();
    for (const scanId of bucket) {
      const scan = this.scans.get(scanId);
      if (!scan) {
        // Phantom entry — can't happen with the upsert/hydrate paths but
        // keep the index clean if it ever does.
        bucket.delete(scanId);
        continue;
      }
      const completedMs = Date.parse(scan.completedAt);
      if (Number.isFinite(completedMs) && now - completedMs > MAX_SCAN_AGE_MS) {
        this.scans.delete(scanId);
        bucket.delete(scanId);
      }
    }
    if (bucket.size === 0) this.scansByRepo.delete(repoId);
  }

  private pruneAuditLogs(): void {
    const now = Date.now();
    const logs = this.listAuditLogs();

    // Prune by age
    for (const log of logs) {
      const createdMs = Date.parse(log.createdAt);
      if (
        Number.isFinite(createdMs) &&
        now - createdMs > MAX_AUDIT_LOG_AGE_MS
      ) {
        this.auditLogs.delete(log.ingestionId);
      }
    }

    // Prune by count (keep newest)
    if (this.auditLogs.size > MAX_AUDIT_LOGS) {
      const sorted = this.listAuditLogs();
      const excess = sorted.slice(MAX_AUDIT_LOGS);
      for (const log of excess) {
        this.auditLogs.delete(log.ingestionId);
      }
    }
  }

  async hydrate(): Promise<void> {
    if (!isPersistenceEnabled()) return;
    await ensureDataDir();

    this.repoSignals.clear();
    this.repoSignalsByFullName.clear();
    this.scans.clear();
    this.scansByRepo.clear();
    this.auditLogs.clear();

    const [repoSignals, scans, auditLogs] = await Promise.all([
      readTwitterJsonlFile<TwitterRepoSignal>(TWITTER_FILES.repoSignals).catch(
        (err) => {
          console.error("[twitter:storage] failed to hydrate repo signals:", err);
          return [];
        },
      ),
      readTwitterJsonlFile<TwitterScanRecord>(TWITTER_FILES.scans).catch((err) => {
        console.error("[twitter:storage] failed to hydrate scans:", err);
        return [];
      }),
      readTwitterJsonlFile<TwitterIngestionAuditLog>(TWITTER_FILES.auditLogs).catch(
        (err) => {
          console.error("[twitter:storage] failed to hydrate audit logs:", err);
          return [];
        },
      ),
    ]);

    for (const signal of repoSignals) {
      this.repoSignals.set(signal.repoId, signal);
      this.repoSignalsByFullName.set(signal.githubFullName, signal.repoId);
    }

    for (const scan of scans) {
      this.scans.set(scan.scanId, scan);
      // Rebuild the per-repo index alongside the main map so post-hydrate
      // listScansForRepo / pruneScansForRepo don't have to walk the full
      // corpus on first access.
      let bucket = this.scansByRepo.get(scan.repo.repoId);
      if (!bucket) {
        bucket = new Set();
        this.scansByRepo.set(scan.repo.repoId, bucket);
      }
      bucket.add(scan.scanId);
    }

    for (const auditLog of auditLogs) {
      this.auditLogs.set(auditLog.ingestionId, auditLog);
    }

    this.dirty = false;
  }

  async persist(): Promise<void> {
    if (!isPersistenceEnabled()) return;
    await ensureDataDir();
    await Promise.all([
      writeJsonlFile(TWITTER_FILES.repoSignals, this.listRepoSignals()),
      writeJsonlFile(TWITTER_FILES.scans, this.listScans()),
      writeJsonlFile(TWITTER_FILES.auditLogs, this.listAuditLogs()),
    ]);
    this.dirty = false;
  }

  async persistIfDirty(): Promise<void> {
    if (!this.dirty) return;
    await this.persist();
  }

  resetForTests(): void {
    this.repoSignals.clear();
    this.repoSignalsByFullName.clear();
    this.scans.clear();
    this.scansByRepo.clear();
    this.auditLogs.clear();
    this.dirty = false;
  }
}

export const twitterStore = new InMemoryTwitterStore();

let readyPromise: Promise<void> | null = null;

// LIB-13: hand the debounce dance off to the shared factory. Pipeline-side
// uses the same factory; the only thing different here is the flush body
// (twitterStore.persistIfDirty vs persistAll) and the log label.
const twitterPersist = createDebouncedPersist({
  flush: () => twitterStore.persistIfDirty(),
  debounceMs: PERSIST_DEBOUNCE_MS,
  label: "twitter",
});

export async function ensureTwitterReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = twitterStore.hydrate();
  }
  await readyPromise;
}

export function scheduleTwitterPersist(
  delayMs: number = PERSIST_DEBOUNCE_MS,
): void {
  twitterPersist.schedule(delayMs);
}

export async function flushTwitterPersist(): Promise<void> {
  await twitterPersist.flush();
}

export function __resetTwitterStoreForTests(): void {
  twitterPersist.cancel();
  readyPromise = null;
  twitterStore.resetForTests();
}
