import { NextResponse } from "next/server";

import {
  getRepoSubmissionById,
  toPublicRepoSubmission,
  type PublicRepoSubmission,
} from "@/lib/repo-submissions";

export const runtime = "nodejs";

interface OkResponse {
  ok: true;
  submission: PublicRepoSubmission;
  /**
   * Convenience number: how many of `scanChannels` have completed (status !==
   * "pending"). Lets the live-queue chip render "scanning 8/20" without
   * iterating client-side.
   */
  scanProgress: {
    done: number;
    total: number;
  };
}

interface ErrResponse {
  ok: false;
  error: string;
}

/**
 * Status polling endpoint for the DORP live-queue chips.
 *
 * Returns the latest record for a given submission id. The /drop page hits
 * this on a 4-6s interval after a POST to flip `● QUEUED` → `● SCANNING`
 * → `✓ LIVE` (or `✗ FAILED`). Never throws on missing records — returns
 * a 404 envelope so the client can drop the row gracefully.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<OkResponse | ErrResponse>> {
  const { id } = await ctx.params;
  if (!id || typeof id !== "string") {
    return NextResponse.json(
      { ok: false, error: "id is required" },
      { status: 400 },
    );
  }

  try {
    const record = await getRepoSubmissionById(id);
    if (!record) {
      return NextResponse.json(
        { ok: false, error: `submission not found: ${id}` },
        { status: 404 },
      );
    }
    const submission = toPublicRepoSubmission(record);
    const total = submission.scanChannels.length;
    const done = submission.scanChannels.filter(
      (c) => c.status !== "pending",
    ).length;
    return NextResponse.json({
      ok: true,
      submission,
      scanProgress: { done, total },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
