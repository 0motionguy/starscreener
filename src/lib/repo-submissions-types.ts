// Shared types + constants for the DORP repo-submissions flow.
// Lives in its own file so `repo-submissions-store.ts` (low-level) can be
// imported by `repo-submissions.ts` (high-level) without a circular dep.

/**
 * Closed set of submission categories. Mirrors the operator-mockup 3-tile
 * picker; new values require a coordinated UI + classifier update.
 */
export const REPO_SUBMISSION_CATEGORIES = ["repo", "skill", "mcp"] as const;
export type RepoSubmissionCategory = (typeof REPO_SUBMISSION_CATEGORIES)[number];

/**
 * Closed set of submission tags. Matches the 12-chip strip on the legacy
 * /drop wizard; the simplified DORP flow doesn't expose tags in the form
 * but the type is retained for back-compat with the persisted records and
 * any future operator-side classifier.
 */
export const REPO_SUBMISSION_TAGS = [
  "AGENTS",
  "RAG",
  "EVAL",
  "VECTOR",
  "CLI",
  "FINETUNE",
  "FRAMEWORK",
  "INFERENCE",
  "DATA",
  "VISION",
  "VOICE",
  "CODEGEN",
] as const;
export type RepoSubmissionTag = (typeof REPO_SUBMISSION_TAGS)[number];

export type RepoSubmissionStatus =
  | "pending"
  | "queued"
  | "scanning"
  | "ingested"
  | "matched"
  | "listed"
  | "scan_failed";

export interface RepoSubmissionInput {
  repo: string;
  whyNow?: string | null;
  contact?: string | null;
  shareUrl?: string | null;
  category?: RepoSubmissionCategory | null;
  tags?: RepoSubmissionTag[] | null;
  releaseUrl?: string | null;
  demoUrl?: string | null;
}

export interface RepoSubmissionRecord {
  id: string;
  fullName: string;
  normalizedFullName: string;
  repoUrl: string;
  whyNow: string | null;
  contact: string | null;
  shareUrl: string | null;
  boostedByShare: boolean;
  source: "web";
  status: RepoSubmissionStatus;
  submittedAt: string;
  intakeTriggeredAt?: string | null;
  lastScanAt?: string | null;
  lastScanError?: string | null;
  matchesFound?: number;
  repoPath?: string | null;
  category?: RepoSubmissionCategory | null;
  tags?: RepoSubmissionTag[] | null;
  releaseUrl?: string | null;
  demoUrl?: string | null;
  /**
   * Per-channel scan verdicts written by the worker drain fetcher.
   * Surfaces "scanning N/20" → "20/20 ✓" progress on the live queue.
   * Absent on submissions that haven't reached the worker yet.
   */
  scanChannels?: ScanChannelVerdict[];
}

export interface ScanChannelVerdict {
  channel: string;
  status: "pending" | "found" | "none" | "error";
  signal?: number | string | null;
  detail?: string;
}

export interface PublicRepoSubmission {
  id: string;
  fullName: string;
  repoUrl: string;
  whyNow: string | null;
  shareUrl: string | null;
  boostedByShare: boolean;
  status: RepoSubmissionStatus;
  submittedAt: string;
  intakeTriggeredAt: string | null;
  lastScanAt: string | null;
  lastScanError: string | null;
  matchesFound: number;
  repoPath: string | null;
  category: RepoSubmissionCategory | null;
  tags: RepoSubmissionTag[];
  releaseUrl: string | null;
  demoUrl: string | null;
  scanChannels: ScanChannelVerdict[];
  /**
   * Sanitized contact for the public live-queue.
   *   - null when the submitter left contact empty
   *   - null when the submitter typed an email (we don't echo PII)
   *   - the @handle otherwise (bare usernames get a leading `@`)
   * Privacy-careful disclosure: emails stay on the private record only;
   * @handles are intentionally public (the submitter put them in to be
   * found).
   */
  publicContact: string | null;
}

export interface RepoSubmissionQueueSummary {
  pending: number;
  queued: number;
  scanning: number;
  listed: number;
  failed: number;
  boosted: number;
  latestSubmittedAt: string | null;
}

export type RepoSubmissionResult =
  | {
      kind: "created";
      submission: PublicRepoSubmission;
      queue: RepoSubmissionQueueSummary;
    }
  | {
      kind: "duplicate";
      submission: PublicRepoSubmission;
      queue: RepoSubmissionQueueSummary;
    }
  | {
      kind: "already_tracked";
      repo: {
        fullName: string;
        repoPath: string;
      };
      queue: RepoSubmissionQueueSummary;
    };

/**
 * DORP intake-stats trio surfaced by the hero on the public /drop page.
 * Computed from the submission log (last 30 days for percentiles, last 7
 * days for the dropped-this-week counter).
 */
export interface RepoSubmissionStats {
  droppedThisWeek: number;
  percentListedUnder24h: number;
  medianTtlHours: number | null;
}
