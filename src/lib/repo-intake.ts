import { getDefaultSocialAdapters } from "@/lib/pipeline/adapters/social-adapters";
import { createGitHubAdapter } from "@/lib/pipeline/ingestion/ingest";
import {
  mentionStore,
  pipeline,
} from "@/lib/pipeline/pipeline";
import {
  getRepoSubmissionById,
  updateRepoSubmissionRecord,
  type RepoSubmissionRecord,
  type RepoSubmissionStatus,
} from "@/lib/repo-submissions";
import {
  manualRepoRecordFromRepo,
  upsertManualRepoRecord,
} from "@/lib/manual-repos";

export interface RepoIntakeSummary {
  submissionId: string;
  fullName: string;
  repoId: string;
  status: RepoSubmissionStatus;
  matchesFound: number;
  repoPath: string;
  scannedAt: string;
}

function truncateError(message: string): string {
  return message.replace(/\s+/g, " ").trim().slice(0, 500);
}

function repoPathFor(fullName: string): string {
  const [owner, name] = fullName.split("/", 2);
  return `/repo/${owner}/${name}`;
}

async function failSubmission(
  submission: RepoSubmissionRecord,
  error: unknown,
): Promise<never> {
  const message = error instanceof Error ? error.message : String(error);
  await updateRepoSubmissionRecord(submission.id, {
    status: "scan_failed",
    lastScanAt: new Date().toISOString(),
    lastScanError: truncateError(message),
  });
  throw error instanceof Error ? error : new Error(message);
}

export async function runRepoIntakeForSubmission(
  submissionId: string,
): Promise<RepoIntakeSummary> {
  const submission = await getRepoSubmissionById(submissionId);
  if (!submission) {
    throw new Error(`repo intake submission not found: ${submissionId}`);
  }

  const triggeredAt = new Date().toISOString();
  await updateRepoSubmissionRecord(submission.id, {
    status: "queued",
    intakeTriggeredAt: submission.intakeTriggeredAt ?? triggeredAt,
    lastScanError: null,
  });

  try {
    await pipeline.ensureReady();
    await updateRepoSubmissionRecord(submission.id, {
      status: "scanning",
      lastScanAt: triggeredAt,
    });

    const token = process.env.GITHUB_TOKEN;
    const githubAdapter = createGitHubAdapter({ token });
    const ingest = await pipeline.ingestRepo(submission.fullName, {
      githubAdapter,
      socialAdapters: getDefaultSocialAdapters(),
    });

    if (!ingest.ok || !ingest.repo) {
      throw new Error(ingest.error || "repo intake ingest failed");
    }

    const scannedAt = new Date().toISOString();
    const manualRecord = manualRepoRecordFromRepo(ingest.repo, {
      intakeSubmissionId: submission.id,
      whyNow: submission.whyNow,
      shareUrl: submission.shareUrl,
      scannedAt,
    });
    await upsertManualRepoRecord(manualRecord);

    const matchesFound = mentionStore.listForRepo(ingest.repo.id).length;
    await pipeline.recomputeAll();
    await pipeline.flushPersist();

    const repoPath = repoPathFor(ingest.repo.fullName);
    await updateRepoSubmissionRecord(submission.id, {
      status: "listed",
      lastScanAt: scannedAt,
      lastScanError: null,
      matchesFound,
      repoPath,
    });

    return {
      submissionId: submission.id,
      fullName: ingest.repo.fullName,
      repoId: ingest.repo.id,
      status: "listed",
      matchesFound,
      repoPath,
      scannedAt,
    };
  } catch (err) {
    return failSubmission(submission, err);
  }
}
