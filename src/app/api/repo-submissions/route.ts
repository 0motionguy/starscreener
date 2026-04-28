import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { verifyCronAuth } from "@/lib/api/auth";
import { parseBody } from "@/lib/api/parse-body";
import { readEnv } from "@/lib/env-helpers";
import { runRepoIntakeForSubmission } from "@/lib/repo-intake";
import {
  listRepoSubmissions,
  submitRepoToQueue,
  summarizeRepoSubmissionQueue,
  toPublicRepoSubmission,
  validateRepoSubmissionInput,
  type PublicRepoSubmission,
  type RepoSubmissionQueueSummary,
  type RepoSubmissionResult,
} from "@/lib/repo-submissions";

export const runtime = "nodejs";

// Shape gate only — field-level validation (length limits, shareUrl host
// allow-list, repo normalization) lives in validateRepoSubmissionInput
// because it composes URL parsing helpers used by other call sites.
const RepoSubmissionsPostSchema = z.record(z.string(), z.unknown());

interface RepoSubmissionsListResponse {
  ok: true;
  queue: RepoSubmissionQueueSummary;
  submissions: PublicRepoSubmission[];
}

interface RepoSubmissionsCreateResponse {
  ok: true;
  result: RepoSubmissionResult;
  intakeTriggered: boolean;
}

interface RepoSubmissionsErrorResponse {
  ok: false;
  error: string;
}

export async function GET(): Promise<
  NextResponse<RepoSubmissionsListResponse | RepoSubmissionsErrorResponse>
> {
  try {
    const records = await listRepoSubmissions();
    return NextResponse.json({
      ok: true,
      queue: summarizeRepoSubmissionQueue(records),
      submissions: records.slice(0, 25).map(toPublicRepoSubmission),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
): Promise<
  NextResponse<RepoSubmissionsCreateResponse | RepoSubmissionsErrorResponse>
> {
  const parsedShape = await parseBody(request, RepoSubmissionsPostSchema);
  if (!parsedShape.ok) {
    return parsedShape.response as NextResponse<RepoSubmissionsErrorResponse>;
  }

  const parsed = validateRepoSubmissionInput(parsedShape.data);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error },
      { status: 400 },
    );
  }

  try {
    const result = await submitRepoToQueue(parsed.value);
    const canTriggerIntake =
      process.env.NODE_ENV !== "production" ||
      verifyCronAuth(request).kind === "ok";
    const autoTriggerEnabled =
      readEnv("TRENDINGREPO_AUTO_INTAKE", "STARSCREENER_AUTO_INTAKE") !==
      "false";
    const triggerableSubmission =
      result.kind === "created" ||
      (result.kind === "duplicate" &&
        (result.submission.status === "pending" ||
          result.submission.status === "scan_failed"));

    const intakeTriggered =
      Boolean(triggerableSubmission && canTriggerIntake && autoTriggerEnabled);
    if (intakeTriggered && result.kind !== "already_tracked") {
      void runRepoIntakeForSubmission(result.submission.id).catch((err) => {
        console.error("[repo-intake] background trigger failed", err);
      });
    }

    return NextResponse.json({ ok: true, result, intakeTriggered });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("repo must be") ? 400 : 500;
    return NextResponse.json(
      { ok: false, error: message },
      { status },
    );
  }
}
