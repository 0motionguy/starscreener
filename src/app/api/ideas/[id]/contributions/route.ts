// GET  /api/ideas/[id]/contributions — public list of contributions
//                                       attached to an idea, oldest first.
//                                       Hidden for pending_moderation /
//                                       rejected ideas (the URL must not
//                                       be useful as a side-channel).
//
// POST /api/ideas/[id]/contributions — Clerk-gated. Append a contribution
//                                       (comment / evidence / repo etc).
//                                       userId is taken from the auth
//                                       session — body fields ignored.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/server";
import { serverError } from "@/lib/api/error-response";
import { parseBody } from "@/lib/api/parse-body";
import { getIdeaById } from "@/lib/ideas";
import {
  appendContribution,
  listContributions,
  validateContributionInput,
  type IdeaContribution,
} from "@/lib/idea-contributions";

// Shape gate only — field-level validation lives in
// validateContributionInput, same split as /api/ideas POST.
const ContributionsPostSchema = z.record(z.string(), z.unknown());

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ContributionsListResponse {
  ok: true;
  contributions: IdeaContribution[];
  total: number;
}

interface ContributionsCreateResponse {
  ok: true;
  contribution: IdeaContribution;
}

interface ContributionsErrorResponse {
  ok: false;
  error: string;
  code?: string;
  details?: { field: string; message: string }[];
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function ensurePubliclyVisible(
  ideaId: string,
): Promise<NextResponse<ContributionsErrorResponse> | null> {
  const idea = await getIdeaById(ideaId);
  if (
    !idea ||
    idea.status === "pending_moderation" ||
    idea.status === "rejected"
  ) {
    return NextResponse.json(
      { ok: false, error: "idea not found" },
      { status: 404 },
    );
  }
  return null;
}

export async function GET(
  _request: NextRequest,
  context: RouteContext,
): Promise<
  NextResponse<ContributionsListResponse | ContributionsErrorResponse>
> {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "id is required" },
      { status: 400 },
    );
  }

  try {
    const deny = await ensurePubliclyVisible(id);
    if (deny) return deny;

    const contributions = await listContributions(id);
    return NextResponse.json({
      ok: true,
      contributions,
      total: contributions.length,
    });
  } catch (err) {
    return serverError<ContributionsErrorResponse>(err, {
      scope: "[ideas/:id/contributions:GET]",
    });
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<
  NextResponse<ContributionsCreateResponse | ContributionsErrorResponse>
> {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "id is required" },
      { status: 400 },
    );
  }

  const user = await requireUser();

  try {
    const deny = await ensurePubliclyVisible(id);
    if (deny) return deny;

    const shape = await parseBody(request, ContributionsPostSchema);
    if (!shape.ok) {
      return shape.response as NextResponse<ContributionsErrorResponse>;
    }
    const validated = validateContributionInput(shape.data);
    if (!validated.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "validation failed",
          details: validated.errors,
        },
        { status: 400 },
      );
    }

    const contribution = await appendContribution({
      ideaId: id,
      userId: user.clerkUserId,
      ...validated.value,
    });
    return NextResponse.json(
      { ok: true, contribution },
      { status: 201 },
    );
  } catch (err) {
    return serverError<ContributionsErrorResponse>(err, {
      scope: "[ideas/:id/contributions:POST]",
    });
  }
}
