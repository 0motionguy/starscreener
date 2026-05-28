import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { verifyCronAuth } from "@/lib/api/auth";
import { parseBody } from "@/lib/api/parse-body";
import { runRepoIntakeForSubmission } from "@/lib/repo-intake";
import { enqueueDeepEnrich } from "@/lib/repo-intake-queue";
import { runScanChannels, SCAN_CHANNEL_COUNT } from "@/lib/repo-scan-channels";
import {
  getRepoSubmissionById,
  toPublicRepoSubmission,
  updateRepoSubmissionRecord,
} from "@/lib/repo-submissions";

export const runtime = "nodejs";
// Pipeline ingest + 23-channel fan-out can run 10-60s on cold caches.
// Keep this handler explicit because the worker calls it outside the
// user's request path.
export const maxDuration = 60;

const EnrichPostSchema = z.object({
  source: z.string().max(120).optional(),
});

interface OkResponse {
  ok: true;
  submissionId: string;
  status: string;
  scanProgress: { done: number; total: number };
}

interface PartialResponse {
  ok: false;
  /** Intake threw but the channel scan ran; surface the resulting record. */
  submissionId: string;
  status: string;
  scanProgress: { done: number; total: number };
  error: string;
}

interface ErrResponse {
  ok: false;
  error: string;
}

/**
 * /api/repo-submissions/[id]/enrich
 *
 * Called by the worker `drop-intake-drain` fetcher after it RPOPs a payload
 * from `queue:drop-a-repo`. Runs the existing pipeline ingest + the
 * per-drop channel fan-out, then returns. Auth: Bearer CRON_SECRET.
 *
 * Pipeline:
 *   1. verifyCronAuth → reject if not authorized
 *   2. read submission record (returns 404 if missing)
 *   3. runRepoIntakeForSubmission() — pre-existing path: GitHub fetch +
 *      mention sweep + manual-repos upsert + pipeline.recomputeAll +
 *      status transitions (queued → scanning → listed/scan_failed)
 *   4. runScanChannels() — read 23 worker-populated Redis data-store keys
 *      and record per-channel verdicts (status: "found"/"none"/"error" with
 *      optional signal value)
 *   5. write scanChannels to the submission record so the live-queue UI
 *      can render the progress chip
 *
 * Failure modes:
 *   - intake throws → submission status is set to "scan_failed" inside the
 *     intake function. We still try the channel scan + persist verdicts so
 *     the UI can show "8 of 23 channels found signal" even on intake failure.
 *   - channel scan throws → we still return success on the intake (status
 *     stays "listed") but log the channel error.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<OkResponse | PartialResponse | ErrResponse>> {
  const auth = verifyCronAuth(request);
  if (auth.kind !== "ok") {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  const parsedBody = await parseBody(request, EnrichPostSchema, {
    allowEmpty: true,
    includeDetails: false,
  });
  if (!parsedBody.ok) {
    return parsedBody.response as NextResponse<ErrResponse>;
  }

  const { id } = await ctx.params;
  if (!id || typeof id !== "string") {
    return NextResponse.json(
      { ok: false, error: "id is required" },
      { status: 400 },
    );
  }

  const submission = await getRepoSubmissionById(id);
  if (!submission) {
    return NextResponse.json(
      { ok: false, error: `submission not found: ${id}` },
      { status: 404 },
    );
  }

  let intakeOk = true;
  let intakeError: string | null = null;
  try {
    await runRepoIntakeForSubmission(id);
  } catch (err) {
    intakeOk = false;
    intakeError = err instanceof Error ? err.message : String(err);
    console.error("[enrich] intake failed for", id, err);
    // intake itself already set status="scan_failed" inside the catch path.
  }

  // Channel fan-out runs even on intake failure — the verdicts are still
  // useful for the live-queue chip ("ingest failed but here's the signal
  // we saw across 23 channels").
  try {
    const verdicts = await runScanChannels(submission.normalizedFullName);
    await updateRepoSubmissionRecord(id, { scanChannels: verdicts });
  } catch (err) {
    console.warn("[enrich] channel scan failed for", id, err);
  }

  // Re-read to surface the latest state.
  const after = await getRepoSubmissionById(id);
  if (!after) {
    return NextResponse.json(
      { ok: false, error: "submission disappeared mid-enrich" },
      { status: 500 },
    );
  }

  // A freshly-listed drop should pop as NEW on the home surfaces + drop feed
  // without waiting for the 30-min ISR window (the recent-drops slug was written
  // by recordRecentDrop inside the intake path above).
  if (intakeOk && after.status === "listed") {
    // Kick off deep enrichment (community profile + LLM editorial overview) for
    // this one repo immediately — the worker drains `queue:drop-deep-enrich`.
    // Best-effort: never fail the enrich response on a queue hiccup.
    try {
      await enqueueDeepEnrich({
        submissionId: id,
        fullName: after.normalizedFullName,
        enqueuedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn("[enrich] enqueueDeepEnrich failed for", id, err);
    }
    try {
      revalidatePath("/");
      revalidatePath("/drop");
    } catch (err) {
      console.warn("[enrich] revalidatePath failed for", id, err);
    }
  }

  const publicShape = toPublicRepoSubmission(after);
  const total = publicShape.scanChannels.length || SCAN_CHANNEL_COUNT;
  const done = publicShape.scanChannels.filter(
    (c) => c.status !== "pending",
  ).length;

  if (intakeOk) {
    return NextResponse.json({
      ok: true,
      submissionId: id,
      status: after.status,
      scanProgress: { done, total },
    });
  }

  return NextResponse.json({
    ok: false,
    submissionId: id,
    status: after.status,
    scanProgress: { done, total },
    error: intakeError ?? "intake failed",
  });
}
