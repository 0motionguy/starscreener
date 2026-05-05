import { persistAisoScan } from "@/lib/aiso-persist";
import { readQueue } from "@/lib/aiso-queue";
import { getAisoToolsScan, type AisoToolsScan } from "@/lib/aiso-tools";
import { appendJsonlFile } from "@/lib/pipeline/storage/file-persistence";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const QUEUE_FILE = "aiso-rescan-queue.jsonl";

export interface RepoHomepageProfile {
  fullName: string;
  websiteUrl: string | null;
  aisoScan?: AisoToolsScan | null;
}

export type AisoScanResult = AisoToolsScan | null;
interface ScanRepoHomepageDeps {
  scan: (url: string | null) => Promise<AisoToolsScan | null>;
  persist: (fullName: string, scan: AisoToolsScan | null) => Promise<void>;
  queueRead: typeof readQueue;
  queueAppend: typeof appendJsonlFile;
}

function isRecentCompletedScan(scan: AisoToolsScan | null | undefined): boolean {
  if (!scan || scan.status !== "completed" || !scan.completedAt) return false;
  const scannedAtMs = Date.parse(scan.completedAt);
  if (!Number.isFinite(scannedAtMs)) return false;
  return Date.now() - scannedAtMs < THIRTY_DAYS_MS;
}

async function enqueueIfMissing(
  fullName: string,
  websiteUrl: string,
  source: "bridge-rate-limit" | "bridge-no-result",
  deps: Pick<ScanRepoHomepageDeps, "queueRead" | "queueAppend">,
): Promise<void> {
  const queue = await deps.queueRead();
  if (queue.some((row) => row.repoFullName.toLowerCase() === fullName.toLowerCase())) {
    return;
  }

  await deps.queueAppend(QUEUE_FILE, {
    fullName,
    websiteUrl,
    requestedAt: new Date().toISOString(),
    requestIp: "bridge",
    source,
  });
}

/**
 * Bridge helper for repo-homepage AISO scans.
 *
 * Behavior:
 * - Idempotent: returns cached completed scans newer than 30 days.
 * - Immediate path: tries to fetch a fresh scan from the AISO endpoint.
 * - Backoff path: when no fresh scan is returned, queues a rescan row so the
 *   cron drain can retry without hammering AISO.
 * - Persistence: successful immediate results are written to repo-profiles.
 */
export async function scanRepoHomepage(
  profile: RepoHomepageProfile,
  deps: ScanRepoHomepageDeps = {
    scan: getAisoToolsScan,
    persist: persistAisoScan,
    queueRead: readQueue,
    queueAppend: appendJsonlFile,
  },
): Promise<AisoScanResult> {
  if (!profile.websiteUrl) return profile.aisoScan ?? null;
  if (isRecentCompletedScan(profile.aisoScan)) return profile.aisoScan ?? null;

  const scan = await deps.scan(profile.websiteUrl);
  if (!scan) {
    await enqueueIfMissing(profile.fullName, profile.websiteUrl, "bridge-no-result", deps);
    return null;
  }

  if (scan.status === "failed") {
    await enqueueIfMissing(profile.fullName, profile.websiteUrl, "bridge-rate-limit", deps);
  }

  await deps.persist(profile.fullName, scan);
  return scan;
}
