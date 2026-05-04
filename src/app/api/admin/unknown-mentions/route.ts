// Admin endpoint for the unknown-mentions discovery surface.
//
// GET  — return data/unknown-mentions-promoted.json so the client can refresh
//        without a page reload. Empty payload if the daily compaction job
//        has not run yet.
// POST — { fullName: "owner/repo" } promotes a candidate into the manual-repos
//        tracked seed by running submitRepoToQueue + runRepoIntakeForSubmission
//        synchronously (admin already vetted; no need for the queue → review
//        loop the public /api/repo-submissions endpoint uses).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { adminAuthFailureResponse, verifyAdminAuth } from "@/lib/api/auth";
import { serverError } from "@/lib/api/error-response";
import { parseBody } from "@/lib/api/parse-body";
import { getDataStore } from "@/lib/data-store";
import { runRepoIntakeForSubmission } from "@/lib/repo-intake";
import { submitRepoToQueue } from "@/lib/repo-submissions";

export const runtime = "nodejs";

const PromoteSchema = z.object({
  fullName: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/, "fullName must be owner/repo"),
});

interface PromotedRow {
  fullName: string;
  totalCount: number;
  sourceCount: number;
  sources: string[];
  firstSeenAt: string;
  lastSeenAt: string;
}

interface PromotedFile {
  generatedAt: string | null;
  totalUnknownMentions: number;
  distinctRepos: number;
  minSources: number;
  topN: number;
  rows: PromotedRow[];
}

const EMPTY_FILE: PromotedFile = {
  generatedAt: null,
  totalUnknownMentions: 0,
  distinctRepos: 0,
  minSources: 1,
  topN: 200,
  rows: [],
};

interface AdminListResponse {
  ok: true;
  data: PromotedFile;
}

interface AdminPromoteResponse {
  ok: true;
  repoPath: string;
  alreadyTracked?: boolean;
}

interface AdminErrorResponse {
  ok: false;
  error: string;
  reason?: string;
}

async function loadPromoted(): Promise<PromotedFile> {
  try {
    const result = await getDataStore().read<PromotedFile>(
      "unknown-mentions-promoted",
    );
    const parsed = (result.data ?? EMPTY_FILE) as Partial<PromotedFile>;
    return {
      generatedAt:
        typeof parsed.generatedAt === "string" ? parsed.generatedAt : null,
      totalUnknownMentions: Number(parsed.totalUnknownMentions ?? 0),
      distinctRepos: Number(parsed.distinctRepos ?? 0),
      minSources: Number(parsed.minSources ?? 1),
      topN: Number(parsed.topN ?? 200),
      rows: Array.isArray(parsed.rows) ? (parsed.rows as PromotedRow[]) : [],
    };
  } catch {
    return EMPTY_FILE;
  }
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<AdminListResponse | AdminErrorResponse>> {
  const deny = adminAuthFailureResponse(verifyAdminAuth(request));
  if (deny) return deny as NextResponse<AdminErrorResponse>;
  try {
    const data = await loadPromoted();
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return serverError<AdminErrorResponse>(err, {
      scope: "[admin/unknown-mentions:GET]",
    });
  }
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<AdminPromoteResponse | AdminErrorResponse>> {
  const deny = adminAuthFailureResponse(verifyAdminAuth(request));
  if (deny) return deny as NextResponse<AdminErrorResponse>;

  const parsed = await parseBody(request, PromoteSchema);
  if (!parsed.ok) return parsed.response as NextResponse<AdminErrorResponse>;

  try {
    const result = await submitRepoToQueue({ repo: parsed.data.fullName });

    if (result.kind === "already_tracked") {
      return NextResponse.json({
        ok: true,
        repoPath: result.repo.repoPath,
        alreadyTracked: true,
      });
    }

    const submissionId =
      result.kind === "created" || result.kind === "duplicate"
        ? result.submission.id
        : null;
    if (!submissionId) {
      return NextResponse.json(
        { ok: false, error: `unexpected submit result kind: ${result.kind}` },
        { status: 500 },
      );
    }

    const intake = await runRepoIntakeForSubmission(submissionId);
    return NextResponse.json({ ok: true, repoPath: intake.repoPath });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("repo must be") ? 400 : 500;
    return serverError<AdminErrorResponse>(err, {
      scope: "[admin/unknown-mentions:POST]",
      publicMessage: status === 400 ? message : "promote failed",
      status,
    });
  }
}
