# AISO Scan Infrastructure Specification

**Phase A1 — Agent Commerce AISO Scanner Producer Script**

This document specifies the public APIs, queue write/drain mechanics, idempotency model, and auth requirements for the follow-up task: `scripts/submit-agent-commerce-aiso.ts`.

---

## 1. Public API Surface

### `aiso-tools.ts` — Scanner Interface

**Exported function:**
```typescript
export async function getAisoToolsScan(
  targetUrl: string | null,
): Promise<AisoToolsScan | null>
```

- **Purpose:** Submit a URL for AISO scanning and poll for results in-process (up to 14s by default).
- **Behavior:**
  - Returns `null` if `targetUrl` is falsy or if auto-scanning is disabled (`TRENDINGREPO_AISO_AUTO_SCAN` / `STARSCREENER_AISO_AUTO_SCAN` = `"false"`).
  - On first call with a URL, submits to `https://aiso.tools/api/scan` (or env override `AISO_API_URL`, `AISO_TOOLS_API_URL`, `AISOTOOLS_API_URL`).
  - Polls the scan status with 1.5s intervals up to the configured wait time (default 14s).
  - **Caching:** In-process memory cache (6h TTL for completed scans, 90s for active, 5m for failed).
- **Return type:** `AisoToolsScan | null` — full scan result including score, tier, dimensions, issues, prompt tests.

### `aiso-queue.ts` — Queue Read/Drain Interface

**Exported functions:**

1. **`readQueue(): Promise<AisoQueueRow[]>`**
   - Reads `.data/aiso-rescan-queue.jsonl`.
   - Returns rows with stable `id` (content-hash or native `id` field).
   - Skips blank lines and malformed JSON with console.warn.
   - Missing file → returns `[]`.

2. **`truncateQueue(processedIds: Set<string>): Promise<number>`**
   - Removes rows whose derived `id` is in `processedIds`.
   - Runs under `withFileLock` (file-local serialization).
   - Returns count of rows removed.
   - **Idempotency:** The same `processedIds` set can be passed multiple times; rows are only removed once.

**Row shape (reader-side, `AisoQueueRow`):**
```typescript
{
  id: string;              // stable identifier (content hash or native id)
  repoFullName: string;    // "owner/name" format
  websiteUrl: string | null;
  queuedAt: string;        // ISO 8601 timestamp
  requestIp?: string | null;
  source?: string | null;  // e.g., "user-retry"
}
```

### `aiso-persist.ts` — Persistence Interface

**Exported function:**
```typescript
export async function persistAisoScan(
  fullName: string,
  scan: AisoToolsScan | null,
): Promise<void>
```

- **Purpose:** Merge a scan result into the committed `data/repo-profiles.json`.
- **Behavior:**
  - Reads the profile file (or creates empty if missing).
  - Upserts the profile by `fullName` (case-insensitive match).
  - Sets `lastProfiledAt` to now, `status` to:
    - `"scanned"` if scan is completed
    - `"scan_failed"` if scan is null or status is "failed"
    - `"scan_running"` if scan is queued/running
  - Clears `error` field on successful scan; preserves on failure.
  - Atomic write via tmp file rename under shared file lock.
  - Also mirrors to data-store (Redis if available, file otherwise) for live reads.
- **Idempotency:** Running twice with the same scan and clock time produces byte-identical files.

---

## 2. Queue Write Path

### Enqueue Mechanism

**Producer route:** `POST /api/repos/[owner]/[name]/aiso`

**Enqueue function (internal):**
```typescript
async function enqueueRescan(row: RescanQueueRow): Promise<void> {
  await appendJsonlFile(RESCAN_QUEUE_FILE, row);
}
```

**Row shape (producer-side):**
```typescript
{
  fullName: string;           // "owner/name"
  websiteUrl: string | null;  // the URL to scan
  requestedAt: string;        // ISO 8601 timestamp (now)
  requestIp: string;          // client IP (for abuse tracking)
  source: "user-retry";       // source marker
}
```

### Queue File

- **Location:** `.data/aiso-rescan-queue.jsonl` (resolved via `currentDataDir()`)
- **Format:** JSONL (one JSON record per line, no array wrapper)
- **Write:** `appendJsonlFile()` → uses `fs.appendFile()` (atomic append)
- **Lock:** File-local serialization via `withFileLock()` prevents concurrent reads/writes from same process

### Drain Flow

**Cron trigger:** `.github/workflows/cron-aiso-drain.yml` — fires every 30 min (UTC :00, :30)

**Drain route:** `POST /api/cron/aiso-drain`

**Drain loop pseudocode:**
1. `readQueue()` → get all rows
2. Dedup by `repoFullName` (keep newest by `queuedAt`)
3. Cap to `limit` (default 10, max 50)
4. For each selected row:
   - Wait `delayMs` (default 3s) between calls
   - Call `getAisoToolsScan(row.websiteUrl)`
   - Call `persistAisoScan(row.repoFullName, scan)`
   - On success: add `row.id` to `processedIds`
   - On failure: leave row in queue for retry
5. `truncateQueue(processedIds)` → remove processed rows

**Results:** Scan results persist into `data/repo-profiles.json` under each profile's `aisoScan` field.

---

## 3. Idempotency Model

### Content-Hash Deduplication

The queue reader derives a stable `id` from each row:
- **If producer wrote an `id` field:** use it (forward compatibility)
- **Otherwise:** compute SHA-256 content hash over fullName+websiteUrl+requestedAt+requestIp (first 24 hex chars)

Fields joined with NUL delimiters to prevent collision from field boundaries.

### Idempotency Guarantees

1. **Queue dedup:** The drain deduplicates by `repoFullName` within a run.
2. **Row id stability:** Same row → same `id` → same truncation behavior.
3. **Persist idempotency:** `persistAisoScan(fullName, scan)` with frozen clock produces byte-identical files on repeated calls.
4. **Retry safety:** Failed rows stay in queue; later retries don't duplicate-process completed rows.

### For the Follow-Up Script

**Recommended:** Check if a profile already has `aisoScan.completedAt` before enqueuing; skip if found.

---

## 4. Required Environment & Auth Keys

### For Submission (Producer)

No auth required — `POST /api/repos/[owner]/[name]/aiso` is public (rate-limited: 1 request/60s per IP).

### For Drain (Cron)

- **`CRON_SECRET`** (required in production, auto-skip in dev)
  - Sent as `Authorization: Bearer $CRON_SECRET`.
  - Missing → 503 in production, auto-allow in development.

### For AISO Scanner

- **`AISO_API_URL` / `AISO_TOOLS_API_URL` / `AISOTOOLS_API_URL`** (optional)
  - Defaults to `https://aiso.tools` (prod) or `http://localhost:3033` (dev).
  - No API key needed.

### For Persistence

- **`TRENDINGREPO_REPO_PROFILES_PATH` / `STARSCREENER_REPO_PROFILES_PATH`** (optional)
  - Defaults to `<cwd>/data/repo-profiles.json`.

- **`TRENDINGREPO_AISO_AUTO_SCAN` / `STARSCREENER_AISO_AUTO_SCAN`** (optional)
  - Set to `"false"` to disable.

### Data Store (Optional)

- **`REDIS_URL`** — if set, scan results mirror to Redis; failures swallowed.

**Summary:** Producer and drain scripts need only cron secret (for drain) and public AISO API (no auth).

---

## 5. Error & Rate-Limit Behavior

### Rate-Limiting (Producer)

- **Per-IP token bucket:** 1 request per 60s per IP (memory-local)
- **Response:** 429 with `Retry-After` header if over limit
- **Reset:** Automatic after 60s

### Scanner Errors

- **Network failure / timeout (8s default) / non-200:** Returns `null` (cached for 5m)

### Persist Errors

- **Corrupt profile file:** Throws immediately
- **Redis mirror failure:** Swallowed with console.warn (file write already succeeded)

### Drain Behavior

- **Persist throw:** Row counted as `failed`, left in queue for retry
- **Scanner `null`:** Counted as `succeeded`, row removed (null persists as `scan_failed`)
- **Dedup:** Sibling rows removed only on successful scan

### Throttling Recommendations

1. **Batch size:** Enqueue all URLs in one shot (appendJsonlFile is atomic file I/O, no rate limit)
2. **Monitor:** Drain cron fires every 30min; allow ~30min for large batches
3. **Retry:** If producer runs daily, re-enqueuing already-scanned URLs is safe (dedup handles it)

---

## 6. Representative Existing Caller

**File:** `src/app/api/cron/aiso-drain/route.ts`, lines 253–280

```typescript
for (let i = 0; i < selected.length; i++) {
  const { row, droppedSiblings } = selected[i];

  if (i > 0 && delayMs > 0) {
    await sleep(delayMs);
  }

  try {
    const scan = await scanner(row.websiteUrl);
    await persistAisoScan(row.repoFullName, scan);
    processedIds.add(row.id);
    for (const sib of droppedSiblings) processedIds.add(sib);
    succeeded += 1;
  } catch (err) {
    failed += 1;
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`${row.repoFullName}: ${message}`);
  }
}

if (processedIds.size > 0) {
  const removed = await truncateQueue(processedIds);
  remaining = Math.max(0, queue.length - removed);
}
```

**Canonical pattern:**
1. Delay between calls (except first) to throttle external API
2. Call `getAisoToolsScan(url)` to fetch and poll result
3. Immediately call `persistAisoScan(fullName, result)` to durably store
4. On success, add row id to `processedIds`; on error, log and skip
5. After loop, `truncateQueue(processedIds)` atomically removes processed rows

---

## 7. Recommended Shape for `scripts/submit-agent-commerce-aiso.ts`

**Pseudocode:**

```typescript
import { readFileSync } from "node:fs";
import path from "node:path";
import { appendJsonlFile } from "@/lib/pipeline/storage/file-persistence";
import { getRepoProfile, refreshRepoProfilesFromStore } from "@/lib/repo-profiles";

interface AgentCommerceItem {
  id: string;
  slug: string;
  name: string;
  links: { website?: string };
}

interface AgentCommerceFile {
  items: AgentCommerceItem[];
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const forceRescan = args.includes("--force");

  // Load agent-commerce.json
  const filePath = path.join(process.cwd(), "data/agent-commerce.json");
  const raw = readFileSync(filePath, "utf8");
  const data = JSON.parse(raw) as AgentCommerceFile;

  // Load existing profiles for idempotency check
  await refreshRepoProfilesFromStore();
  const alreadyScanned = new Set<string>();
  if (!forceRescan) {
    for (const item of data.items) {
      const profile = getRepoProfile(item.id);
      if (profile?.aisoScan?.status === "completed") {
        alreadyScanned.add(item.id);
      }
    }
  }

  let enqueued = 0, skipped = 0;
  const now = new Date().toISOString();

  for (const item of data.items) {
    const websiteUrl = item.links?.website;
    
    if (!websiteUrl) {
      console.log(`[skip] ${item.id}: no website URL`);
      skipped++;
      continue;
    }

    if (alreadyScanned.has(item.id)) {
      console.log(`[skip] ${item.id}: already scanned`);
      skipped++;
      continue;
    }

    if (!dryRun) {
      await appendJsonlFile("aiso-rescan-queue.jsonl", {
        fullName: item.id,
        websiteUrl,
        requestedAt: now,
        requestIp: "127.0.0.1",
        source: "agent-commerce-producer",
      });
    }

    console.log(`[enqueue] ${item.id}: ${websiteUrl}`);
    enqueued++;
  }

  console.log(`\n[summary] enqueued=${enqueued}, skipped=${skipped}, dryRun=${dryRun}`);
}

main().catch(err => { console.error("[error]", err); process.exit(1); });
```

**Key decisions:**

- **Idempotency check:** Load profiles, skip already-scanned unless `--force`
- **Website field:** Use `item.links.website`
- **FullName:** Use `item.id` as profile key
- **Missing URL:** Skip with log
- **Dry-run:** `--dry-run` logs without writing
- **Source:** `"agent-commerce-producer"`
- **IP:** `127.0.0.1` (localhost, not a client)
- **No inline scan:** Just enqueue; drain cron handles scanning/persisting

**Usage:**
```bash
npx tsx scripts/submit-agent-commerce-aiso.ts --dry-run
npx tsx scripts/submit-agent-commerce-aiso.ts
npx tsx scripts/submit-agent-commerce-aiso.ts --force
```

---

## Summary

The AISO infrastructure is queue-based and asynchronous:

1. **Producer** appends rows to `.data/aiso-rescan-queue.jsonl` via `appendJsonlFile()`.
2. **Queue** is plain JSONL, deduplicated by `repoFullName` and row content-hash.
3. **Drain** (cron every 30min) pops rows, calls `getAisoToolsScan()`, persists results, truncates queue.
4. **Idempotency:** Content-hash dedup + file-local locking + profile-level caching.
5. **Env:** Only `CRON_SECRET` needed for drain (required in prod, auto-skip in dev); scanner uses public AISO API.
6. **Error handling:** Failed scans stay in queue; persist throws count as failures.

The producer script should batch-enqueue all agent-commerce items with website URLs, optionally skipping those marked `scan_completed` in profiles, and rely on the scheduled drain cron to process them.
