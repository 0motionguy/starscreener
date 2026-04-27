import { NextRequest, NextResponse } from "next/server";

import { verifyCronAuth } from "@/lib/api/auth";
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
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "request body is not valid JSON" },
      { status: 400 },
    );
  }

  const parsed = validateRepoSubmissionInput(raw);
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
      process.env.STARSCREENER_AUTO_INTAKE !== "false";
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
